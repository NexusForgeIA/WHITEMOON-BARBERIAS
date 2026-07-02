import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const WA_NUMBER = Deno.env.get("WA_NUMBER") || "34643199580";
const CALLMEBOT_APIKEY = Deno.env.get("CALLMEBOT_APIKEY") || "";

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { nombre, telefono, barbero, servicio, dia, hora } = await req.json();

    const msg = `✂️ NUEVO LEAD — BARBERS CLUB

👤 ${nombre}
📱 ${telefono}
💈 Barbero: ${barbero}
✂️ Servicio: ${servicio}
📅 ${dia} a las ${hora}

📲 CONTACTAR: https://wa.me/34${telefono}`;

    const encoded = encodeURIComponent(msg);
    const url = `https://api.callmebot.com/whatsapp.php?phone=${WA_NUMBER}&text=${encoded}&apikey=${CALLMEBOT_APIKEY}`;

    await fetch(url);

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
