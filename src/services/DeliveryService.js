import axios from "axios";
import { AppError } from "../errors/AppError.js";

// ─── Constantes da Pizzaria ───────────────────────────────────────────────────
// Endereço fixo: Avenida Cachoeira Paulista, 17 — CEP 03551-000, São Paulo
const PIZZARIA_LAT = -23.5318;
const PIZZARIA_LON = -46.5043;

const TAXA_POR_KM = 8.0; // R$ 8,00 por km rodado

// ─── Helpers ─────────────────────────────────────────────────────────────────
const formatBRL = (valor) =>
  valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ─── Serviço de Entrega ───────────────────────────────────────────────────────
export class DeliveryService {
  /**
   * Calcula o frete com base no CEP, número e cidade do cliente.
   * @param {string} cep    - CEP do cliente (com ou sem traço)
   * @param {string} numero - Número da residência
   * @param {string} cidade - Cidade do cliente
   * @returns {{ distanciaKm: number, valorFrete: string, tempoEstimado: number }}
   */
  async calculateFreight({ cep, numero, cidade }) {
    // ── Etapa 1: Geocodificação via Nominatim ────────────────────────────────
    // Transforma "CEP + Número + Cidade + Brasil" em coordenadas (lat/lon)
    const cleanCep = cep.replace(/\D/g, "");
    const query = `${cleanCep}, ${numero}, ${cidade}, Brasil`;

    let lat, lon, displayName;

    try {
      const nominatimRes = await axios.get(
        "https://nominatim.openstreetmap.org/search",
        {
          params: {
            q: query,
            format: "json",
            limit: 1,
            countrycodes: "br",
          },
          headers: {
            // User-Agent personalizado exigido pelo Nominatim
            "User-Agent":
              "PizzariaFellice/1.0 (contato@pizzariafellice.com.br)",
            "Accept-Language": "pt-BR",
          },
          timeout: 8000,
        },
      );

      if (!nominatimRes.data || nominatimRes.data.length === 0) {
        throw new AppError(
          "Endereço não encontrado. Verifique o CEP, número e cidade informados.",
          422,
        );
      }

      lat = parseFloat(nominatimRes.data[0].lat);
      lon = parseFloat(nominatimRes.data[0].lon);
      displayName = nominatimRes.data[0].display_name;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError("Falha ao consultar serviço de geocodificação.", 502);
    }

    // ── Etapa 2: Cálculo de Rota via OSRM ───────────────────────────────────
    // Obtém a distância real de condução por ruas entre a pizzaria e o cliente
    // Formato da URL: lon_origem,lat_origem;lon_destino,lat_destino
    let distanceMeters, durationSeconds;

    try {
      const osrmRes = await axios.get(
        `http://router.project-osrm.org/route/v1/driving/${PIZZARIA_LON},${PIZZARIA_LAT};${lon},${lat}`,
        {
          params: { overview: "false" },
          timeout: 8000,
        },
      );

      if (osrmRes.data.code !== "Ok" || !osrmRes.data.routes?.[0]) {
        throw new AppError(
          "Não foi possível calcular a rota para o endereço informado.",
          422,
        );
      }

      // OSRM retorna distância em metros e duração em segundos
      distanceMeters = osrmRes.data.routes[0].distance;
      durationSeconds = osrmRes.data.routes[0].duration;
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError("Falha ao calcular rota de entrega.", 502);
    }

    // ── Etapa 3: Cálculo do Frete ────────────────────────────────────────────
    // Converte metros → km e aplica taxa de R$ 8,00/km
    const distanciaKm = Math.round((distanceMeters / 1000) * 10) / 10;
    const valorFreteNumerico = distanciaKm * TAXA_POR_KM;
    const tempoEstimado = Math.ceil(durationSeconds / 60); // segundos → minutos

    return {
      lat,
      lon,
      displayName,
      distanciaKm,
      valorFrete: formatBRL(valorFreteNumerico), // ex: "R$ 41,60"
      valorFreteNumerico: Math.round(valorFreteNumerico * 100) / 100,
      tempoEstimado, // em minutos
    };
  }
}
