import { useEffect } from 'react';

// Défilement horizontal automatique pour tous les tableaux du SaaS.
// Attache à chaque conteneur `.table-wrap` une barre miroir visible en haut
// (`.table-scroll-top`) qui reproduit la largeur du contenu et synchronise le
// scroll dans les deux sens. Un MutationObserver prend en charge aussi bien les
// tableaux déjà présent au chargement que tous ceux créés/retirés dynamiquement
// (changement de route, filtres…), y compris les futurs tableaux.
// Les tables en mode cartes mobiles (`.table-cards`) sont ignorées.
export default function GlobalTableScroll() {
  useEffect(() => {
    const bars = new WeakMap();

    const fit = (bar, spacer, wrap) => {
      const need = wrap.scrollWidth > wrap.clientWidth + 1;
      if (bar.style.display === (need ? 'block' : 'none')) return;
      bar.style.display = need ? 'block' : 'none';
      if (!need) return;
      spacer.style.width = `${wrap.scrollWidth}px`;
      if (bar.scrollLeft !== wrap.scrollLeft) bar.scrollLeft = wrap.scrollLeft;
    };

    const wire = (wrap) => {
      if (wrap.classList.contains('table-cards') || bars.has(wrap)) return;
      const bar = document.createElement('div');
      bar.className = 'table-scroll-top';
      bar.style.display = 'none';
      const spacer = document.createElement('div');
      spacer.className = 'table-scroll-top-inner';
      bar.appendChild(spacer);
      wrap.parentNode.insertBefore(bar, wrap);

      const onWrap = () => {
        if (bar.scrollLeft !== wrap.scrollLeft) bar.scrollLeft = wrap.scrollLeft;
      };
      const onBar = () => {
        if (wrap.scrollLeft !== bar.scrollLeft) wrap.scrollLeft = bar.scrollLeft;
      };
      wrap.addEventListener('scroll', onWrap, { passive: true });
      bar.addEventListener('scroll', onBar, { passive: true });
      const ro = typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(() => {
            const sl = wrap.scrollLeft;
            fit(bar, spacer, wrap);
            wrap.scrollLeft = sl;
          })
        : null;
      if (ro) ro.observe(wrap);
      const onResize = () => fit(bar, spacer, wrap);
      window.addEventListener('resize', onResize);

      bars.set(wrap, {
        bar,
        onWrap,
        onBar,
        onResize,
        ro,
        attached: true,
      });
      fit(bar, spacer, wrap);
    };

    const unwire = (wrap) => {
      const d = bars.get(wrap);
      if (!d) return;
      wrap.removeEventListener('scroll', d.onWrap);
      d.bar.removeEventListener('scroll', d.onBar);
      window.removeEventListener('resize', d.onResize);
      if (d.ro) d.ro.disconnect();
      d.bar.remove();
      bars.delete(wrap);
    };

    const scan = (root) => {
      if (root.matches && root.matches('.table-wrap')) wire(root);
      if (root.querySelectorAll) root.querySelectorAll('.table-wrap').forEach(wire);
    };

    scan(document);

    const mo = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((n) => {
          if (n.nodeType === 1) scan(n);
        });
        m.removedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          if (n.matches && n.matches('.table-wrap')) unwire(n);
          else if (n.querySelectorAll) n.querySelectorAll('.table-wrap').forEach(unwire);
        });
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });

    return () => {
      mo.disconnect();
      scanDispose();
    };

    function scanDispose() {
      if (document.querySelectorAll) {
        document.querySelectorAll('.table-wrap').forEach(unwire);
      }
    }
  }, []);

  return null;
}