import { AppError } from "../errors/AppError.js";

// Pizzaria Fellice — Vila Guilhermina, São Paulo, SP
const PIZZARIA_LAT = -23.5348;
const PIZZARIA_LON = -46.5011;

const FREIGHT_RATE_PER_KM = 8.0; // R$ 8,00 por km
const MINIMUM_FREIGHT = 5.0;

async function geocodeCep(cep, numero) {
  const cleanCep = cep.replace(/\D/g, "");

  // First try: CEP + número + São Paulo (most precise)
  const query = `${cleanCep}, ${numero}, São Paulo, Brasil`;
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=br`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "PizzariaFellice/1.0 (contact@pizzariafellice.com.br)",
      "Accept-Language": "pt-BR",
    },
  });

  if (!res.ok) {
    throw new AppError("Falha ao consultar API de geocodificação.", 502);
  }

  const data = await res.json();

  if (data.length > 0) {
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  }

  // Fallback: only CEP
  const fallbackUrl = `https://nominatim.openstreetmap.org/search?postalcode=${cleanCep}&country=Brasil&format=json&limit=1`;
  const fallbackRes = await fetch(fallbackUrl, {
    headers: {
      "User-Agent": "PizzariaFellice/1.0 (contact@pizzariafellice.com.br)",
      "Accept-Language": "pt-BR",
    },
  });

  if (!fallbackRes.ok) {
    throw new AppError("Falha ao consultar API de geocodificação.", 502);
  }

  const fallbackData = await fallbackRes.json();

  if (fallbackData.length === 0) {
    throw new AppError(
      "Endereço não encontrado. Verifique o CEP e número informados.",
      422,
    );
  }

  return {
    lat: parseFloat(fallbackData[0].lat),
    lon: parseFloat(fallbackData[0].lon),
    displayName: fallbackData[0].display_name,
  };
}

async function getRouteDistanceKm(originLat, originLon, destLat, destLon) {
  // OSRM public API — driving route
  const url = `https://router.project-osrm.org/route/v1/driving/${originLon},${originLat};${destLon},${destLat}?overview=false`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": "PizzariaFellice/1.0",
    },
  });

  if (!res.ok) {
    throw new AppError("Falha ao calcular rota de entrega.", 502);
  }

  const data = await res.json();

  if (data.code !== "Ok" || !data.routes?.[0]) {
    throw new AppError(
      "Não foi possível calcular a rota para o endereço informado.",
      422,
    );
  }

  const distanceMeters = data.routes[0].distance;
  return distanceMeters / 1000;
}

export class DeliveryService {
  async calculateFreight({ cep, numero, complemento }) {
    const { lat, lon, displayName } = await geocodeCep(cep, numero);

    const distanceKm = await getRouteDistanceKm(
      PIZZARIA_LAT,
      PIZZARIA_LON,
      lat,
      lon,
    );

    const rawFee = distanceKm * FREIGHT_RATE_PER_KM;
    const fee = Math.max(rawFee, MINIMUM_FREIGHT);

    return {
      lat,
      lon,
      distanceKm: Math.round(distanceKm * 10) / 10,
      fee: Math.round(fee * 100) / 100,
      displayName,
    };
  }
}
