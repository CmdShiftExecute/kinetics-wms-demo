import { Suspense, lazy, useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router';
import { ErrorBoundary } from './components/ErrorBoundary';
import { TableSkeleton } from './components/Skeleton';
import Overview from './pages/Overview';

const CapacityPage = lazy(() => import('./pages/CapacityPage'));
const AgingPage = lazy(() => import('./pages/AgingPage'));
const ReplenishmentPage = lazy(() => import('./pages/ReplenishmentPage'));
const CostPage = lazy(() => import('./pages/CostPage'));
const CalculatorPage = lazy(() => import('./pages/CalculatorPage'));
const InboundPage = lazy(() => import('./pages/InboundPage'));
const DataBasis = lazy(() => import('./pages/DataBasis'));
const GroupPage = lazy(() => import('./pages/GroupPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

function Fallback() {
  return (
    <div className="wrap" style={{ paddingTop: 'var(--s-3xl)' }}>
      <TableSkeleton rows={8} />
    </div>
  );
}

/* The overview is in the main bundle so the first paint needs one script; every other route is split and loaded on demand. */

/** Scroll to the top on every path change, or to the anchor when the address carries one. */
function ScrollManager() {
  const { pathname, hash, key } = useLocation();
  const anchorNavigation = hash ? key : undefined;
  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);
  useEffect(() => {
    if (!hash) { window.scrollTo({ top: 0 }); return; }
    let anchor: string;
    try { anchor = decodeURIComponent(hash.slice(1)); } catch { return; }
    let frame = 0;
    // The route's exit animation and data fetch can finish after this effect.
    // Wait for the target in the incoming route, then for masthead measurement.
    const scrollToAnchor = () => {
      const target = document.getElementById(anchor);
      const main = Array.from(document.querySelectorAll('main')).find(el => el.dataset.route === pathname);
      if (!target || !main?.contains(target)) return;
      observer.disconnect();
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
      });
    };
    const observer = new MutationObserver(scrollToAnchor);
    observer.observe(document.getElementById('root')!, { childList: true, subtree: true });
    scrollToAnchor();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [pathname, hash, anchorNavigation]);
  return null;
}

function Pages() {
  const location = useLocation();
  const reduce = useReducedMotion();
  const page = reduce ? {} : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.2 } };
  // No `initial={false}` on AnimatePresence below. That flag suppresses the entry
  // animation of every motion component beneath it on FIRST load, which is why page
  // titles and headline strips never rose and the app read as static on every page
  // that had neither a chart nor count-up figures. Measured 13 Sep 2026: restoring it
  // took /calculator from 1 distinct rendered frame to 3.
  return (
    <AnimatePresence mode="wait">
      <motion.main key={location.pathname} data-route={location.pathname} {...page}>
        {/* The entry signature. A rule draws left to right across the content on every
            route entry, on the same curve as the nav underline, because a drawn rule is
            this system's own vocabulary. It replaced a count-up on the headline figures,
            which was removed on 12 Sep 2026 for showing values that did not cross-foot
            mid-tween. A rule carries the motion; the numbers stay still. */}
        {!reduce && (
          <motion.div
            key={`rule-${location.pathname}`}
            className="entry-rule"
            aria-hidden="true"
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          />
        )}
        <ErrorBoundary key={location.pathname}>
          <Suspense fallback={<Fallback />}>
            <Routes location={location}>
              <Route path="/" element={<Overview />} />
              <Route path="/capacity" element={<CapacityPage />} />
              <Route path="/aging" element={<AgingPage />} />
              <Route path="/replenishment" element={<ReplenishmentPage />} />
              <Route path="/cost" element={<CostPage />} />
              <Route path="/calculator" element={<CalculatorPage />} />
              <Route path="/inbound" element={<InboundPage />} />
              <Route path="/data-basis" element={<DataBasis />} />
              <Route path="/g/:slug" element={<GroupPage />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </motion.main>
    </AnimatePresence>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <ScrollManager />
      <Pages />
    </BrowserRouter>
  );
}
