// supabase/functions/sincronizar-mis-cargas/index.ts
//
// Trae de Mis Cargas el ingreso limpio (saldo del dueño) de cada camión por
// mes y lo guarda como movimientos de Camiones con origen 'mis_cargas'.
// Cada mes y patente es un solo movimiento (ref_externa única), así que
// sincronizar de nuevo actualiza en vez de duplicar. Si un camión dio
// negativo en el mes, se carga como gasto.
//
// La llama la app con la sesión del usuario. El token de Mis Cargas no pasa
// nunca por el navegador: se lee acá de mis_cargas_conexion con la service
// role.
//
// Deploy (con verificación de JWT, que es lo normal):
//   supabase functions deploy sincronizar-mis-cargas
// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY ya vienen.

import { createClient } from "npm:@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const responder = (cuerpo: unknown, status = 200) =>
  new Response(JSON.stringify(cuerpo), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const MAX_MESES = 24;

// Meses como 'aaaa-mm', con aritmética entera: nada de Date en hora local.
const sumarMeses = (mes: string, n: number) => {
  const [a, m] = mes.split("-").map(Number);
  const total = a * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
};
const ultimoDia = (mes: string) => {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return `${mes}-${String(d).padStart(2, "0")}`;
};
const normalizarPatente = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, "");

type Patente = { patente: string; saldo_dueno: number; viajes?: number; viajes_sin_saldo?: number };
type Dador = { dador: string; monto: number; viajes?: number };
type RespuestaMisCargas = { meses: { mes: string; patentes: Patente[] }[]; por_cobrar?: Dador[] };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return responder({ error: "Método no permitido" }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // 1. Quién llama y de qué hogar es
  const auth = req.headers.get("Authorization") ?? "";
  const comoUsuario = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: auth } },
  });
  const { data: { user } } = await comoUsuario.auth.getUser();
  if (!user) return responder({ error: "La sesión venció. Volvé a entrar." }, 401);

  const { data: miembro } = await admin
    .from("household_members").select("household_id").eq("user_id", user.id).maybeSingle();
  if (!miembro) return responder({ error: "Tu usuario no pertenece a ningún hogar." }, 403);
  const hogar = miembro.household_id as string;

  // 2. Rango pedido
  let desde: string, hasta: string;
  try {
    ({ desde, hasta } = await req.json());
  } catch {
    return responder({ error: "Falta el rango de meses." }, 400);
  }
  if (!MES.test(desde ?? "") || !MES.test(hasta ?? "") || desde > hasta) {
    return responder({ error: "Rango de meses inválido (aaaa-mm)." }, 400);
  }
  if (sumarMeses(desde, MAX_MESES) <= hasta) {
    return responder({ error: `Se pueden pedir hasta ${MAX_MESES} meses por vez.` }, 400);
  }

  const registrar = (ok: boolean, detalle: string) =>
    admin.from("mis_cargas_sync").insert({ household_id: hogar, desde, hasta, ok, detalle });

  // 3. Conexión guardada
  const { data: conexion } = await admin
    .from("mis_cargas_conexion").select("url, token").eq("household_id", hogar).maybeSingle();
  if (!conexion) return responder({ error: "Falta conectar Mis Cargas en Ajustes." }, 400);

  // 4. Consultar Mis Cargas
  let datos: RespuestaMisCargas;
  try {
    const destino = new URL(conexion.url);
    destino.searchParams.set("desde", desde);
    destino.searchParams.set("hasta", hasta);
    const r = await fetch(destino, {
      headers: { Authorization: `Bearer ${conexion.token}` },
      signal: AbortSignal.timeout(20000),
    });
    if (r.status === 401 || r.status === 403) {
      await registrar(false, "Mis Cargas rechazó el token");
      return responder({ error: "Mis Cargas rechazó el token. Generá uno nuevo y cargalo en Ajustes." }, 502);
    }
    if (!r.ok) throw new Error(`Mis Cargas respondió ${r.status}`);
    datos = await r.json();
    if (!Array.isArray(datos?.meses)) throw new Error("Respuesta de Mis Cargas con formato inesperado");
  } catch (e) {
    const detalle = e instanceof Error ? e.message : String(e);
    await registrar(false, detalle);
    return responder({ error: `No se pudo consultar Mis Cargas: ${detalle}` }, 502);
  }

  // 5. Categorías del hogar para ingreso y pérdida
  const { data: cats } = await admin
    .from("categorias").select("id, tipo")
    .eq("household_id", hogar).eq("area", "camiones").eq("clave", "mis_cargas");
  const catIngreso = cats?.find((c) => c.tipo === "ingreso")?.id;
  const catGasto = cats?.find((c) => c.tipo === "gasto")?.id;
  if (!catIngreso || !catGasto) {
    await registrar(false, "Faltan las categorías de Mis Cargas");
    return responder({ error: "Faltan las categorías de Mis Cargas. Corré 03_datos_iniciales.sql." }, 500);
  }

  // 6. Armar los movimientos
  const filas = [];
  const refs = new Set<string>();
  for (const { mes, patentes } of datos.meses) {
    if (!MES.test(mes) || mes < desde || mes > hasta) continue;
    for (const p of patentes ?? []) {
      const saldo = Math.round(Number(p.saldo_dueno) * 100) / 100;
      if (!p.patente || !Number.isFinite(saldo) || saldo === 0) continue;
      const ref = `mis_cargas:${mes}:${normalizarPatente(p.patente)}`;
      refs.add(ref);
      const viajes = Number(p.viajes) || 0;
      filas.push({
        household_id: hogar,
        tipo: saldo > 0 ? "ingreso" : "gasto",
        area: "camiones",
        categoria_id: saldo > 0 ? catIngreso : catGasto,
        monto: Math.abs(saldo),
        // Cierre del mes: es lo que dejó el camión en todo el mes.
        fecha: ultimoDia(mes),
        nota: `${viajes} ${viajes === 1 ? "viaje" : "viajes"}`,
        origen: "mis_cargas",
        patente: p.patente.toUpperCase().trim(),
        ref_externa: ref,
        creado_por: null,
      });
    }
  }

  if (filas.length) {
    const { error } = await admin.from("movimientos").upsert(filas, { onConflict: "household_id,ref_externa" });
    if (error) {
      await registrar(false, error.message);
      return responder({ error: `No se pudo guardar: ${error.message}` }, 500);
    }
  }

  // 7. Si en Mis Cargas borraron todos los viajes de un camión en un mes,
  //    acá también tiene que desaparecer.
  const { data: previos } = await admin
    .from("movimientos").select("id, ref_externa")
    .eq("household_id", hogar).eq("origen", "mis_cargas")
    .gte("fecha", `${desde}-01`).lte("fecha", ultimoDia(hasta));
  const sobran = (previos ?? []).filter((m) => !refs.has(m.ref_externa)).map((m) => m.id);
  if (sobran.length) await admin.from("movimientos").delete().in("id", sobran);

  // 8. Lo que deben los dadores (si esta versión de Mis Cargas lo manda).
  //    Es una foto del momento: se reemplaza entera en cada sincronización.
  let dadores = 0;
  if (Array.isArray(datos.por_cobrar)) {
    const filasDeuda = datos.por_cobrar
      .filter((d) => d?.dador && Number(d.monto) > 0)
      .map((d) => ({
        household_id: hogar,
        area: "camiones",
        quien: String(d.dador).trim(),
        detalle: d.viajes ? `${d.viajes} ${d.viajes === 1 ? "viaje" : "viajes"} sin liquidar` : null,
        monto: Math.round(Number(d.monto) * 100) / 100,
        origen: "mis_cargas",
        ref_externa: `mis_cargas:dador:${String(d.dador).trim().toLowerCase()}`,
      }));
    if (filasDeuda.length) {
      const { error } = await admin.from("por_cobrar").upsert(filasDeuda, { onConflict: "household_id,ref_externa" });
      if (error) console.error("por_cobrar", error.message);
    }
    const vigentes = new Set(filasDeuda.map((f) => f.ref_externa));
    const { data: previas } = await admin
      .from("por_cobrar").select("id, ref_externa").eq("household_id", hogar).eq("origen", "mis_cargas");
    const viejas = (previas ?? []).filter((p) => !vigentes.has(p.ref_externa)).map((p) => p.id);
    if (viejas.length) await admin.from("por_cobrar").delete().in("id", viejas);
    dadores = filasDeuda.length;
  }

  const meses = datos.meses.filter((m) => MES.test(m.mes) && m.mes >= desde && m.mes <= hasta).length;
  const detalle = `${filas.length} camión-mes en ${meses} ${meses === 1 ? "mes" : "meses"}`;
  await registrar(true, detalle);
  return responder({ ok: true, actualizados: filas.length, borrados: sobran.length, dadores, detalle });
});
