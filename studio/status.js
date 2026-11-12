window.HARTII_BUILD = {
  updated: '2026-11-12T10:01:00+01:00',
  stage: 'Private beta · CI passed',
  summary: '29 local tests passed. The initial Windows/Linux CI passed; an added gate now checks package equality across platforms.',
  checks: [
    { label: 'CLI help + strict flags', state: 'pass', detail: '8 tests passed locally' },
    { label: 'Transaction safety engine', state: 'pass', detail: '12 core/operations tests passed, including single-use submission and receipt reconciliation' },
    { label: 'Four-tool protocol check', state: 'pass', detail: '7 steps passed with a local test server; no live chain' },
    { label: 'Reproducible packages', state: 'pass', detail: '5 repeatable archives; executable permissions normalized; independent install passed' },
    { label: 'Cross-platform package equality', state: 'building', detail: 'New matrix gate prepared after fixing Windows/Linux executable-mode differences' },
    { label: 'Windows + Linux CI', state: 'pass', detail: 'All 4 GitHub jobs passed: Windows/Linux × Node 22/24; source commit d56a92b' },
    { label: 'Real team pilot', state: 'planned', detail: 'No external pilot or revenue verified' }
  ]
};
