"""Run reproducible build and offline Node/Chromium tests. No game login."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
import hashlib
import json
import os
import re
import signal
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'validation-logs'
OUT.mkdir(exist_ok=True)
NODE_TESTS = ['main-upgrade', 'automation', 'reservations', 'field-roles',
              'catalog-source', 'egg-filters', 'updater', 'pet-advisor',
              'pet-automation', 'v16']
BROWSERS = {
    'compact_menu': 'test-output/report.json',
    'field_choices': 'test-output/field-choices/report.json',
    'catalog_recovery': 'test-output/catalog-recovery/report.json',
    'v16_integration': 'test-output/v16-integration/report.json',
}
checks = []
mutex = threading.Lock()
started = datetime.now(timezone.utc).isoformat()


def run(name, command, timeout=75):
    """Write directly to a log: subprocess descendants cannot hold a pipe open."""
    start = time.monotonic()
    log = OUT / (name + '.log')
    passed = False
    code = None
    with log.open('w', encoding='utf-8') as stream:
        process = None
        try:
            process = subprocess.Popen(
                command, cwd=ROOT, stdout=stream, stderr=subprocess.STDOUT,
                start_new_session=(os.name == 'posix'),
            )
            code = process.wait(timeout=timeout)
            passed = code == 0
        except subprocess.TimeoutExpired:
            if process is not None:
                if os.name == 'posix':
                    os.killpg(process.pid, signal.SIGKILL)
                else:
                    process.kill()
                process.wait()
            stream.write(f'\nTIMEOUT after {timeout} seconds. Check not passed.\n')
        except OSError as exc:
            stream.write(f'\nExecution error: {exc}\n')
    item = {'name': name, 'passed': passed, 'returncode': code,
            'seconds': round(time.monotonic() - start, 2),
            'log': log.relative_to(ROOT).as_posix()}
    with mutex:
        checks.append(item)
        print(('PASS ' if passed else 'FAIL ') + name, flush=True)
    return passed


def browser_test(script):
    report_path = ROOT / BROWSERS[script]
    report_path.unlink(missing_ok=True)
    return run('browser-' + script,
               [sys.executable, '-u', f'tests/browser/{script}.py'])


before = (ROOT / 'MagicGardenAutoFarm.user.js').read_bytes()
built = run('build', ['node', 'scripts/build.cjs'])
checks.append({'name': 'reproducible_bundle', 'passed': built and
               before == (ROOT / 'MagicGardenAutoFarm.user.js').read_bytes()})
if built:
    run('syntax', ['node', '--check', 'MagicGardenAutoFarm.user.js'])
    run('node', ['node', '--test',
                 *[f'tests/{test}.test.cjs' for test in NODE_TESTS]])
    # Isolated browser fixtures use separate output directories and no network.
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(browser_test, BROWSERS))

node_text = (OUT / 'node.log').read_text(encoding='utf-8') if (OUT / 'node.log').exists() else ''

def tap_count(label):
    match = re.search(r'^# ' + re.escape(label) + r' (\d+)$', node_text, re.M)
    return int(match.group(1)) if match else None

browser_suites = []
for script, file in BROWSERS.items():
    record = next((c for c in checks if c['name'] == 'browser-' + script), None)
    try:
        data = json.loads((ROOT / file).read_text(encoding='utf-8'))
        count = data['checks'] if isinstance(data.get('checks'), int) else data.get('passed')
        browser_suites.append({'name': script, 'checks': count,
                               'passed': bool(record and record['passed']),
                               'report': file})
    except (OSError, ValueError, KeyError):
        browser_suites.append({'name': script, 'checks': None, 'passed': False,
                               'report': file})

report = {
    'version': '16.1.0', 'test_build': True,
    'started_utc': started, 'completed_utc': datetime.now(timezone.utc).isoformat(),
    'published_to_github': False, 'live_game_tested': False,
    'environment': 'Local Node and Chromium offline simulated native game state',
    'sha256': hashlib.sha256((ROOT / 'MagicGardenAutoFarm.user.js').read_bytes()).hexdigest(),
    'node_tests': tap_count('tests'), 'node_passed': tap_count('pass'),
    'node_failed': tap_count('fail'),
    'browser_checks': sum(s['checks'] or 0 for s in browser_suites),
    'browser_suites': browser_suites, 'checks': checks,
    'all_checks_passed': all(c['passed'] for c in checks) and
                         all(s['passed'] for s in browser_suites),
}
(ROOT / 'test-report.json').write_text(
    json.dumps(report, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps({k: report[k] for k in
                 ['node_tests', 'node_passed', 'node_failed', 'browser_checks',
                  'all_checks_passed', 'sha256']}, indent=2), flush=True)
raise SystemExit(0 if report['all_checks_passed'] else 1)
