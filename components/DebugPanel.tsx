'use client';

import useDebugMode from '@/hooks/useDebugMode';
import useGallery from '@/hooks/useGallery';
import useSettings, { SETTINGS_DEFAULTS } from '@/hooks/useSettings';
import { makeTestColorBlob } from '@/lib/collage';

export default function DebugPanel() {
  const { enabled, setEnabled } = useDebugMode();
  const { settings, update, reset } = useSettings();
  const { clearAll, save } = useGallery();

  const fillTestColors = async () => {
    const count = settings.slotCount;
    for (let i = 0; i < count; i++) {
      const blob = await makeTestColorBlob(i, count);
      if (blob) await save(i, blob);
    }
  };

  if (!enabled) return null;

  return (
    <div className="debug-backdrop" onClick={() => setEnabled(false)}>
      <div className="debug-panel" onClick={(e) => e.stopPropagation()}>
        <div className="debug-header">
          <span>debug · cupid</span>
          <button type="button" onClick={() => setEnabled(false)} aria-label="close">×</button>
        </div>
        <label className="debug-field">
          <span>player title</span>
          <input
            type="text"
            value={settings.title}
            onChange={(e) => update({ title: e.target.value })}
          />
        </label>
        <label className="debug-field">
          <span>admin name (na espera)</span>
          <input
            type="text"
            value={settings.adminName}
            onChange={(e) => update({ adminName: e.target.value })}
          />
        </label>
        <label className="debug-field">
          <span>quantidade de fotos: {settings.slotCount}</span>
          <input
            type="range"
            min={1}
            max={30}
            value={settings.slotCount}
            onChange={(e) => update({ slotCount: Number(e.target.value) })}
          />
        </label>
        <label className="debug-field">
          <span>welcome — etapa 1</span>
          <input
            type="text"
            value={settings.welcomeStep1}
            onChange={(e) => update({ welcomeStep1: e.target.value })}
          />
        </label>
        <label className="debug-field">
          <span>welcome — etapa 2</span>
          <input
            type="text"
            value={settings.welcomeStep2}
            onChange={(e) => update({ welcomeStep2: e.target.value })}
          />
        </label>
        <label className="debug-field">
          <span>welcome — etapa 3</span>
          <input
            type="text"
            value={settings.welcomeStep3}
            onChange={(e) => update({ welcomeStep3: e.target.value })}
          />
        </label>
        <label className="debug-field">
          <span>texto do coração</span>
          <input
            type="text"
            value={settings.heartLabel}
            onChange={(e) => update({ heartLabel: e.target.value })}
          />
        </label>
        <label className="debug-field debug-check">
          <input
            type="checkbox"
            checked={settings.showHeart}
            onChange={(e) => update({ showHeart: e.target.checked })}
          />
          <span>mostrar coração + galeria</span>
        </label>
        <div className="debug-row">
          <button
            type="button"
            className="debug-btn"
            onClick={async () => {
              if (confirm(`preencher TODOS os ${settings.slotCount} slots com cores de teste? sobrescreve as fotos existentes.`)) {
                await fillTestColors();
              }
            }}
          >
            preencher slots (teste)
          </button>
        </div>
        <div className="debug-row">
          <button
            type="button"
            className="debug-btn danger"
            onClick={async () => {
              if (confirm('RESETAR TUDO?\n• apaga todas as fotos\n• reseta welcome (mostra de novo)\n• volta config padrão\n\nessa ação não dá pra desfazer.')) {
                await clearAll();
                reset();
              }
            }}
          >
            resetar tudo
          </button>
          <button type="button" className="debug-btn primary" onClick={() => setEnabled(false)}>
            fechar
          </button>
        </div>
        <div className="debug-footer">
          5 toques em &quot;{settings.title}&quot; abre/fecha esse painel. defaults: title={SETTINGS_DEFAULTS.title}, slots={SETTINGS_DEFAULTS.slotCount}
        </div>
      </div>
    </div>
  );
}
