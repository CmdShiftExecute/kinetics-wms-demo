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
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1));
      if (el) {
        el.scrollIntoView({ block: 'start' });
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [pathname, hash]);
  return null;
}

function Pages() {
  const location = useLocation();
  const reduce = useReducedMotion();
  const page = reduce ? {} : { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0 }, transition: { duration: 0.2 } };
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.main key={location.pathname} {...page}>
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
