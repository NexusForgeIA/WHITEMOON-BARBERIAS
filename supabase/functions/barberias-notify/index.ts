import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// barberias-notify — captura de lead + aviso por Telegram de una nueva CITA de la
// demo WhiteMoon de barbería.
// Token de Telegram EXCLUSIVAMENTE server-side.
//
// Antes esta función SOLO avisaba por Telegram: el lead no se guardaba en ningún
// sitio, así que si el aviso se perdía (o nadie lo leía) no quedaba rastro.
// Ahora también inserta en leads_web con service role, igual que vet-notify.
//
// Recibe (POST JSON): { nombre, telefono, barbero, servicio, dia, hora, test? }
//
// Secrets usados (nunca en cliente):
//   - TELEGRAM_BOT_TOKEN        : token del bot de Telegram
//   - TELEGRAM_CHAT_ID          : chat destino; si falta se usa CHAT_ID_FALLBACK
//   - SUPABASE_URL              : inyectado por la plataforma
//   - SUPABASE_SERVICE_ROLE_KEY : inyectado por la plataforma
//
// IMPORTANTE: es una SOLICITUD de cita de una DEMO, no una reserva confirmada.
//
// Regla del proyecto: si el insert o el envío fallan → console.warn, nunca
// interrumpe la conversación del chatbot.
//
// Desplegar con:
//   supabase functions deploy barberias-notify --no-verify-jwt --project-ref mlaqtniujnvfxcvcourm

// El chat_id no es un secreto (solo identifica el destino); el token sí lo es.
const CHAT_ID_FALLBACK = "861432965";

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json; charset=utf-8",
      },
    });

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    payload = {};
  }

  const data = (payload.args ?? payload) as Record<string, unknown>;
  const nombre = String(data.nombre ?? "").trim();
  const telefono = String(data.telefono ?? "").trim();
  const barbero = String(data.barbero ?? "").trim();
  const servicio = String(data.servicio ?? "").trim();
  const dia = String(data.dia ?? "").trim();
  const hora = String(data.hora ?? "").trim();
  const soloPrueba = data.test === true;

  const digits = telefono.replace(/\D/g, "");

  // 1) Lead en leads_web (service role → no requiere clave en el cliente)
  const mensaje = [
    servicio && `Servicio: ${servicio}`,
    barbero && `Barbero: ${barbero}`,
    (dia || hora) && `Cita: ${dia}${hora ? ` a las ${hora}` : ""}`,
  ].filter(Boolean).join(" · ");

  let stored = false;
  try {
    const supaUrl = Deno.env.get("SUPABASE_URL");
    const supaKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (supaUrl && supaKey) {
      const r = await fetch(`${supaUrl}/rest/v1/leads_web`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          apikey: supaKey,
          Authorization: `Bearer ${supaKey}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          nombre: nombre || null,
          telefono: telefono || null,
          sector: "barberia",
          interes: servicio || "cita",
          mensaje: mensaje || null,
          origen: "barberias-demo",
          cita_dia: dia || null,
          cita_hora: hora || null,
          fecha: new Date().toISOString(),
        }),
      });
      stored = r.ok;
      if (!r.ok) {
        console.warn("[barberias-notify] insert leads_web falló:", r.status, await r.text());
      }
    } else {
      console.warn("[barberias-notify] sin SUPABASE_URL/SERVICE_ROLE_KEY, lead no guardado");
    }
  } catch (e) {
    console.warn("[barberias-notify] error insertando lead:", e);
  }

  // 2) Aviso por Telegram
  const msg =
    (soloPrueba
      ? "🧪 PRUEBA — demo WhiteMoon · Barbería\n\n"
      : "✂️ NUEVA CITA — demo WhiteMoon · Barbería\n\n") +
    `👤 ${nombre || "-"}\n` +
    `📱 ${telefono || "-"}\n` +
    (barbero ? `💈 Barbero: ${barbero}\n` : "") +
    `✂️ Servicio: ${servicio || "-"}\n` +
    `📅 ${dia || "-"}${hora ? ` a las ${hora}` : ""}\n\n` +
    "⚠️ Lead de una WEB DE DEMOSTRACIÓN: es una SOLICITUD, no una reserva confirmada.\n" +
    (digits.length >= 9 ? `📲 CONTACTAR: https://wa.me/34${digits}` : "");

  let notified = false;
  try {
    const tgToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
    const tgChat = Deno.env.get("TELEGRAM_CHAT_ID") || CHAT_ID_FALLBACK;
    if (tgToken) {
      const r = await fetch(
        `https://api.telegram.org/bot${tgToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json; charset=utf-8" },
          body: JSON.stringify({ chat_id: tgChat, text: msg }),
        },
      );
      notified = r.ok;
      if (!r.ok) {
        console.warn("[barberias-notify] Telegram falló:", r.status, await r.text());
      }
    } else {
      console.warn("[barberias-notify] sin TELEGRAM_BOT_TOKEN, mensaje:", msg);
    }
  } catch (e) {
    console.warn("[barberias-notify] error enviando Telegram:", e);
  }

  return json({ ok: true, stored, notified });
});
