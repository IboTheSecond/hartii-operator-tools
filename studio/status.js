window.HARTII_BUILD = {
  updated: '2026-11-12T09:57:00+01:00',
  stage: 'Local beta verified',
  summary: '26 local tests passed. All four CLI workflows passed the local protocol check; five reproducible packages installed independently.',
  checks: [
    { label: 'CLI help + strict flags', state: 'pass', detail: '8 tests passed locally' },
    { label: 'Transaction safety engine', state: 'pass', detail: '12 core/operations tests passed, including single-use submission and receipt reconciliation' },
    { label: 'Four-tool protocol check', state: 'pass', detail: '7 steps passed with a local test server; no live chain' },
    { label: 'Reproducible packages', state: 'pass', detail: '5 matching archives; independently installed and exercised' },
    { label: 'Windows + Linux CI', state: 'building', detail: 'Workflow prepared; remote checks not yet run' },
    { label: 'Real team pilot', state: 'planned', detail: 'No external pilot or revenue verified' }
  ]
};
