// PARA MIS CARGAS: copiar a supabase/functions/ingreso-mensual/index.ts de
// ese repositorio.
//
// Endpoint de solo lectura para la app "Cuentas de la familia". Devuelve,
// por mes y por patente, el saldo del dueño. Se autentica con un token de
// integración (tabla tokens_integracion), no con la sesión de Supabase.
//
//   GET ?desde=2026-08&hasta=2026-10
//   Authorization: Bearer mc_xxxxxxxx
//
//   200 { "meses": [ { "mes": "2026-10", "patentes": [
//           { "patente": "AE 412 KT", "saldo_dueno": 1120000, "viajes": 9, "viajes_sin_saldo": 0 } ] } ] }
//
// Deploy SIN verificación de JWT (el token es propio):
//   supabase functions deploy ingreso-mensual --no-verify-jwt
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya vienen configurados.

import { createClient } from "npm:@supabase/supabase-js@2";

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function sha256(texto: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return responder({ error: "Solo GET" }, 405);

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return responder({ error: "Falta el token" }, 401);

  const url = new URL(req.url);
  const desde = url.searchParams.get("desde") ?? "";
  const hasta = url.searchParams.get("hasta") ?? "";
  if (!MES.test(desde) || !MES.test(hasta) || desde > hasta) {
    return responder({ error: "desde y hasta tienen que ser aaaa-mm" }, 400);
  }

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  const { data: fila } = await admin
    .from("tokens_integracion")
    .select("id, user_id")
    .eq("token_hash", await sha256(token))
    .is("revocado_at", null)
    .maybeSingle();
  // Misma respuesta para token inexistente o revocado: no dar pistas.
  if (!fila) return responder({ error: "Token inválido" }, 401);

  await admin.from("tokens_integracion").update({ ultimo_uso: new Date().toISOString() }).eq("id", fila.id);

  const { data, error } = await admin.rpc("saldo_mensual_por_patente", {
    p_user: fila.user_id, p_desde: desde, p_hasta: hasta,
  });
  if (error) return responder({ error: "No se pudo calcular" }, 500);

  const porMes = new Map<string, unknown[]>();
  for (const r of data ?? []) {
    if (!porMes.has(r.mes)) porMes.set(r.mes, []);
    porMes.get(r.mes)!.push({
      patente: r.patente,
      saldo_dueno: Number(r.saldo_dueno),
      viajes: r.viajes,
      viajes_sin_saldo: r.viajes_sin_saldo,
    });
  }
  return responder({ meses: [...porMes].map(([mes, patentes]) => ({ mes, patentes })) });
});
