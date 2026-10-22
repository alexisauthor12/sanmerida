/**
 * Sistema de financiamiento SAN: 50% inicial + cuotas quincenales, con la
 * duracion (nº de cuotas) y el monto de cada cuota configurados POR MODELO de
 * moto. El administrador controla ambos valores a mano.
 *
 * Este modulo es puro (sin base de datos ni React) para poder probarlo.
 */

export const FINANCING_PLAN_NAME = "Financiamiento 50% (quincenal)";
export const FINANCING_INTERVAL_DAYS = 15;
export const DEFAULT_INITIAL_PERCENTAGE = 50;
export const DEFAULT_FINANCING_INSTALLMENTS = 12;
export const MAX_FINANCING_INSTALLMENTS = 200;

export function isFinancingPlan(planName) {
  return /financ/i.test(String(planName ?? ""));
}

function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  const parsed = Number(String(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round2(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

/** Normaliza y valida la configuracion de financiamiento de un modelo. */
export function normalizeFinancingConfig(input = {}) {
  const precioBase = Math.max(0, round2(toNumber(input.precioBase, 0)));
  const porcentajeInicial = Math.min(100, Math.max(1, round2(toNumber(input.porcentajeInicial, DEFAULT_INITIAL_PERCENTAGE))));
  const cuotasQuincenales = Math.min(
    MAX_FINANCING_INSTALLMENTS,
    Math.max(1, Math.round(toNumber(input.cuotasQuincenales, DEFAULT_FINANCING_INSTALLMENTS))),
  );
  const montoCuotaRaw = toNumber(input.montoCuota, 0);

  return {
    precioBase,
    porcentajeInicial,
    cuotasQuincenales,
    montoCuota: montoCuotaRaw > 0 ? round2(montoCuotaRaw) : 0,
    activo: input.activo === undefined ? true : Boolean(input.activo),
  };
}

/**
 * Calcula el desglose del financiamiento.
 * `montoCuota` es el valor que el admin define a mano; `cuotaSugerida` es la
 * referencia (saldo / nº de cuotas) para que pueda comparar.
 */
export function computeFinancing(input = {}) {
  const config = normalizeFinancingConfig(input);
  const inicial = round2((config.precioBase * config.porcentajeInicial) / 100);
  const saldo = round2(Math.max(0, config.precioBase - inicial));
  const cuotaSugerida = config.cuotasQuincenales > 0 ? round2(saldo / config.cuotasQuincenales) : 0;
  const cuota = config.montoCuota > 0 ? config.montoCuota : cuotaSugerida;
  const totalCuotas = round2(cuota * config.cuotasQuincenales);
  const meses = round2((config.cuotasQuincenales * FINANCING_INTERVAL_DAYS) / 30);

  return {
    ...config,
    inicial,
    saldo,
    cuotaSugerida,
    cuota,
    totalCuotas,
    meses,
    // Diferencia entre lo que cobrara en cuotas y el saldo real a financiar.
    diferencia: round2(totalCuotas - saldo),
    usaMontoManual: config.montoCuota > 0,
  };
}

/** Resumen corto para mostrar en el registro. */
export function describeFinancing(input = {}) {
  const detail = computeFinancing(input);

  if (detail.precioBase <= 0) {
    return "Configura el precio base del modelo para calcular el financiamiento.";
  }

  return `Inicial ${detail.porcentajeInicial}% ($${detail.inicial}) + ${detail.cuotasQuincenales} cuotas quincenales de $${detail.cuota} (${detail.meses} meses aprox.)`;
}
