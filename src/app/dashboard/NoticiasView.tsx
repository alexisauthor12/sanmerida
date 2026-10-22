/**
 * Feed de Noticias / Actualizaciones (panel de usuario).
 *
 * Componente INDEPENDIENTE a propósito: cualquier cambio futuro aquí (contenido,
 * estilos, notificaciones) NO debe afectar al panel principal (`DashboardClient`).
 * Antes vivía dentro de `DashboardClient.tsx` y los cambios se filtraban al panel.
 */
import { Rss } from "lucide-react";

const noticias = [
  {
    id: "corporativo",
    categoria: "Corporativo",
    categoriaClass: "text-blue-400 bg-blue-400/10",
    cuando: "Hace 2 horas",
    titulo: "San Mérida fortalece su ecosistema de movilidad",
    resumen:
      "Con la integración de nuevos procesos digitales, hemos reducido los tiempos de entrega en un 40%. La nueva infraestructura permite trazabilidad completa desde la selección hasta la entrega formal.",
  },
  {
    id: "modelos",
    categoria: "Modelos",
    categoriaClass: "text-emerald-400 bg-emerald-400/10",
    cuando: "Ayer",
    titulo: "Expansión de la línea EK Xpress para envíos",
    resumen:
      "Ante la alta demanda del sector corporativo, anunciamos la llegada de 500 nuevas unidades del modelo EK Xpress, optimizadas específicamente para empresas de última milla.",
  },
];

const metricasRapidas = [
  { label: "Solicitudes procesadas", value: "1,204" },
  { label: "Tasa de aprobación", value: "92%" },
  { label: "Tiempo resp. (avg)", value: "4.2 hrs" },
];

export default function NoticiasView() {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
      <h2 className="text-2xl font-light text-white mb-2">Noticias y Actualizaciones</h2>
      <p className="text-white/60 mb-8">Feed de datos en tiempo real sobre San Mérida.</p>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {noticias.map((item) => (
            <div key={item.id} className="p-6 rounded-2xl border border-white/10 bg-zinc-950/50">
              <div className="flex items-center justify-between mb-4">
                <span className={`text-xs px-2 py-1 rounded ${item.categoriaClass}`}>{item.categoria}</span>
                <span className="text-xs text-white/40">{item.cuando}</span>
              </div>
              <h3 className="text-xl text-white font-medium mb-3">{item.titulo}</h3>
              <p className="text-sm text-white/60 leading-relaxed">{item.resumen}</p>
            </div>
          ))}
        </div>

        <div className="space-y-6">
          <div className="p-6 rounded-2xl border border-white/10 bg-black flex flex-col items-center text-center">
            <Rss size={32} className="text-white/20 mb-4" />
            <h4 className="text-white font-medium mb-2">Sincronización de Sistema</h4>
            <p className="text-xs text-white/50 mb-4">Los datos de mercado se actualizan cada 5 minutos.</p>
            <div className="flex items-center gap-2 text-emerald-400 text-sm">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></div>
              Sistemas Online
            </div>
          </div>

          <div className="p-6 rounded-2xl border border-white/10 bg-black">
            <h4 className="text-white font-medium mb-4">Métricas Rápidas</h4>
            <ul className="space-y-3">
              {metricasRapidas.map((metrica) => (
                <li key={metrica.label} className="flex justify-between items-center text-sm">
                  <span className="text-white/50">{metrica.label}</span>
                  <span className="text-white font-medium">{metrica.value}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
