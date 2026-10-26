// supabase/functions/recordatorios-diarios/index.ts
//
// La llama el cron todas las mañanas (07_cron.sql). Para cada hogar:
//   1. carga los gastos fijos automáticos que vencieron (por si el cron de
//      las 6 no corrió);
//   2. manda un aviso al celular por lo que vence hoy o dentro de los días de
//      anticipación elegidos, y por lo que se cargó solo desde ayer.
//
// No usa la sesión de nadie: la protege un secreto compartido con el cron.
// Deploy:
//   supabase functions deploy recordatorios-diarios --no-verify-jwt
// Secrets (Edge Functions → Secrets):
//   CRON_SECRET        el mismo valor que está en 07_cron.sql
//   VAPID_PUBLIC_KEY   } se generan con: npx web-push generate-vapid-keys
//   VAPID_PRIVATE_KEY  }
//   VAPID_SUBJECT      mailto: de contacto, por ejemplo mailto:vos@dominio.com

import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), { status, headers: { "Content-Type": "application/json" } });

// Fecha de calendario en Argentina, como 'aaaa-mm-dd'.
const hoyArgentina = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());

const sumarDias = (iso: string, n: number) => {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d + n)).toISOString().slice(0, 10);
};

const plata = (n: number) => `$ ${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
const diaMes = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

Deno.serve(async (req) => {
  const secreto = Deno.env.get("CRON_SECRET");
  if (!secreto || req.headers.get("x-cron-secret") !== secreto) {
    return responder({ error: "No autorizado" }, 401);
  }

  const publica = Deno.env.get("VAPID_PUBLIC_KEY");
  const privada = Deno.env.get("VAPID_PRIVATE_KEY");
  const sujeto = Deno.env.get("VAPID_SUBJECT") ?? "mailto:avisos@example.com";
  const pushListo = Boolean(publica && privada);
  if (pushListo) webpush.setVapidDetails(sujeto, publica!, privada!);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const hoy = hoyArgentina();
  const resumen = { hogares: 0, cargados: 0, avisos: 0, suscripcionesBorradas: 0 };

  const { data: hogares } = await admin.from("households").select("id");
  for (const { id: hogar } of hogares ?? []) {
    resumen.hogares++;
    const { data: cargados } = await admin.rpc("cargar_fijos_vencidos_de", { p_household: hogar });
    resumen.cargados += Number(cargados) || 0;
    if (!pushListo) continue;

    const { data: subs } = await admin.from("push_suscripciones").select("id, endpoint, p256dh, auth").eq("household_id", hogar);
    if (!subs?.length) continue;

    const { data: conf } = await admin.from("configuracion").select("aviso_dias").eq("household_id", hogar).maybeSingle();
    const anticipacion = conf?.aviso_dias ?? 2;
    const limite = sumarDias(hoy, anticipacion);

    // Lo que vence en los próximos días y no se carga solo
    const { data: proximos } = await admin
      .from("gastos_fijos").select("concepto, monto, proximo_vencimiento")
      .eq("household_id", hogar).eq("activo", true).eq("automatico", false)
      .gte("proximo_vencimiento", hoy).lte("proximo_vencimiento", limite)
      .order("proximo_vencimiento");

    // Lo que se cargó solo en las últimas 24 h
    const desde = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: solos } = await admin
      .from("movimientos").select("nota, monto")
      .eq("household_id", hogar).eq("origen", "fijo").is("creado_por", null).gte("created_at", desde);

    const avisos: { title: string; body: string; url: string; tag: string }[] = [];
    for (const v of proximos ?? []) {
      const cuando = v.proximo_vencimiento === hoy ? "hoy" : `el ${diaMes(v.proximo_vencimiento)}`;
      avisos.push({
        title: `Vence ${cuando}: ${v.concepto}`,
        body: Number(v.monto) ? `${plata(Number(v.monto))}. Tocá para pagarlo.` : "Tocá para pagarlo.",
        url: "/vencimientos",
        tag: `vence-${v.concepto}-${v.proximo_vencimiento}`,
      });
    }
    if (solos?.length) {
      avisos.push({
        title: solos.length === 1 ? `Se cargó solo: ${solos[0].nota}` : `Se cargaron solos ${solos.length} gastos fijos`,
        body: solos.length === 1
          ? `${plata(Number(solos[0].monto))}. Si cambió el monto, corregilo.`
          : solos.map((s) => `${s.nota} ${plata(Number(s.monto))}`).join(" · "),
        url: "/movimientos",
        tag: `solos-${hoy}`,
      });
    }

    const vivas = [...subs];
    for (const aviso of avisos) {
      for (const s of [...vivas]) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            JSON.stringify(aviso),
            { TTL: 12 * 60 * 60 },
          );
          resumen.avisos++;
        } catch (e) {
          // 404/410: el navegador dio de baja la suscripción. Se borra.
          const status = (e as { statusCode?: number }).statusCode;
          if (status === 404 || status === 410) {
            await admin.from("push_suscripciones").delete().eq("id", s.id);
            vivas.splice(vivas.indexOf(s), 1);
            resumen.suscripcionesBorradas++;
          } else {
            console.error("push", status, (e as Error).message);
          }
        }
      }
    }
  }

  return responder({ ok: true, hoy, pushConfigurado: pushListo, ...resumen });
});
