import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_FINANCING_INSTALLMENTS,
  FINANCING_PLAN_NAME,
  computeFinancing,
  describeFinancing,
  isFinancingPlan,
  normalizeFinancingConfig,
} from "../src/lib/moto-financing.mjs";

test("isFinancingPlan reconoce el plan de financiamiento", () => {
  assert.equal(isFinancingPlan(FINANCING_PLAN_NAME), true);
  assert.equal(isFinancingPlan("Financiamiento 50%"), true);
  assert.equal(isFinancingPlan("Plan de 26 cuotas (cada 15 días)"), false);
  assert.equal(isFinancingPlan("Plan de 83 cuotas"), false);
  assert.equal(isFinancingPlan(""), false);
});

test("normalizeFinancingConfig aplica valores por defecto y limites", () => {
  const base = normalizeFinancingConfig({});
  assert.equal(base.porcentajeInicial, 50);
  assert.equal(base.cuotasQuincenales, DEFAULT_FINANCING_INSTALLMENTS);
  assert.equal(base.montoCuota, 0);
  assert.equal(base.activo, true);

  const clamped = normalizeFinancingConfig({ porcentajeInicial: 150, cuotasQuincenales: 9999, precioBase: -50 });
  assert.equal(clamped.porcentajeInicial, 100);
  assert.equal(clamped.cuotasQuincenales, 200);
  assert.equal(clamped.precioBase, 0);

  const low = normalizeFinancingConfig({ porcentajeInicial: 0, cuotasQuincenales: 0 });
  assert.equal(low.porcentajeInicial, 1);
  assert.equal(low.cuotasQuincenales, 1);
});

test("computeFinancing divide el 50% y calcula la cuota sugerida", () => {
  const detail = computeFinancing({ precioBase: 1200, porcentajeInicial: 50, cuotasQuincenales: 12 });

  assert.equal(detail.inicial, 600);
  assert.equal(detail.saldo, 600);
  assert.equal(detail.cuotaSugerida, 50);
  assert.equal(detail.cuota, 50);
  assert.equal(detail.totalCuotas, 600);
  assert.equal(detail.diferencia, 0);
  assert.equal(detail.meses, 6);
  assert.equal(detail.usaMontoManual, false);
});

test("computeFinancing respeta el monto de cuota escrito a mano", () => {
  const detail = computeFinancing({ precioBase: 1200, porcentajeInicial: 50, cuotasQuincenales: 12, montoCuota: 55 });

  assert.equal(detail.cuota, 55);
  assert.equal(detail.cuotaSugerida, 50);
  assert.equal(detail.totalCuotas, 660);
  assert.equal(detail.diferencia, 60);
  assert.equal(detail.usaMontoManual, true);
});

test("computeFinancing acepta porcentajes y precios personalizados", () => {
  const detail = computeFinancing({ precioBase: 1000, porcentajeInicial: 40, cuotasQuincenales: 10, montoCuota: 60 });

  assert.equal(detail.inicial, 400);
  assert.equal(detail.saldo, 600);
  assert.equal(detail.cuotaSugerida, 60);
  assert.equal(detail.diferencia, 0);
});

test("computeFinancing tolera precio en cero", () => {
  const detail = computeFinancing({ precioBase: 0, cuotasQuincenales: 12 });

  assert.equal(detail.inicial, 0);
  assert.equal(detail.saldo, 0);
  assert.equal(detail.cuotaSugerida, 0);
  assert.equal(detail.cuota, 0);
});

test("describeFinancing resume el plan o pide el precio", () => {
  const texto = describeFinancing({ precioBase: 1200, cuotasQuincenales: 12, montoCuota: 50 });
  assert.match(texto, /Inicial 50% \(\$600\)/);
  assert.match(texto, /12 cuotas quincenales de \$50/);
  assert.match(texto, /6 meses/);

  assert.match(describeFinancing({ precioBase: 0 }), /Configura el precio base/);
});
