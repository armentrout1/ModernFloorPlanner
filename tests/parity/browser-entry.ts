import { evaluateQuantities, createQuantitySnapshot } from '../../shared/quantities/snapshot';

// Test-only compiled entry. Never imported by the production client or server.
Object.defineProperty(window, 'mfpParity', {
  value: Object.freeze({ evaluate: evaluateQuantities, snapshot: createQuantitySnapshot }),
  writable: false,
});
document.getElementById('status')!.textContent = 'Shared quantity engine ready';
