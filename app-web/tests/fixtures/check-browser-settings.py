"""Synthetic Browser UI only. Start fixture Vite on 5187; no real Settings API."""
from playwright.sync_api import sync_playwright

STATES = ['first', 'prepared', 'setup', 'install', 'ready', 'paused', 'missing',
          'update', 'mismatch', 'retry', 'disabled', 'imported', 'empty', 'importing',
          'unverified', 'checking', 'repairing', 'stopped', 'checkFailed']

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel='chromium')
    try:
        page = browser.new_page()
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))

        def open_state(state):
            page.goto('http://127.0.0.1:5187/tests/fixtures/browser-settings.html?state=' + state)
            page.locator('.browser-status-label').wait_for()
            page.wait_for_timeout(100)

        def writes():
            return page.evaluate('window.__browserFixture.writes')

        def expect_write(action, confirmed=False, allow_replace=False):
            page.wait_for_function('window.__browserFixture.writes.length === 1')
            assert writes() == [{'action': action, 'confirmed': confirmed, 'allow_replace': allow_replace}]

        for width in [1100, 390]:
            page.set_viewport_size({'width': width, 'height': 820})
            for state in STATES:
                open_state(state)
                assert not writes()
                assert page.locator('.browser-runtime-summary').count() == 0  # Details collapsed.
                assert page.get_by_role('button', name='Check browser', exact=True).count() == 0
                info = page.evaluate('''() => {
                  const badge=document.querySelector('.browser-status'), text=badge.querySelector('span'), icon=badge.querySelector('svg');
                  if(icon) icon.style.animation='none';
                  const rect=e=>{const r=e.getBoundingClientRect();return {cy:r.y+r.height/2,w:r.width,h:r.height}};
                  const setup=document.querySelector('.browser-setup-status');
                  return {label:text.textContent,text:rect(text),icon:icon?rect(icon):null,
                    setup:setup?{icon:rect(setup.querySelector('svg')),text:rect(setup.querySelector('strong'))}:null,
                    buttons:[...document.querySelectorAll('.browser-action-buttons button')].map(e=>e.textContent),
                    overflow:document.documentElement.scrollWidth>innerWidth};
                }''')
                assert not info['overflow'], (width, state, info)
                if info['icon']:
                    assert abs(info['text']['cy'] - info['icon']['cy']) < 0.5, (width, state, info)
                    assert info['icon']['w'] == info['icon']['h'] == 12, info
                if info['setup']:
                    assert abs(info['setup']['text']['cy'] - info['setup']['icon']['cy']) < 0.5, info
                labels = {'first': 'Install and enable', 'prepared': 'Set up and enable',
                          'missing': 'Repair dependencies', 'update': 'Update dependencies',
                          'mismatch': 'Update dependencies', 'retry': 'Retry repair',
                          'disabled': 'Enable', 'stopped': 'Keep existing logins'}
                if state in labels:
                    assert labels[state] in info['buttons'], info
                if state in ['ready', 'imported', 'empty']:
                    assert info['buttons'] == ['Pause', 'Disable'], info
                if state in ['ready', 'disabled', 'unverified', 'checkFailed', 'paused']:
                    assert page.get_by_role('checkbox').count() == 0, state
                page.get_by_role('button', name='Details', exact=True).click()
                expected_check = 'Checking…' if state == 'checking' else 'Check browser'
                assert page.get_by_role('button', name=expected_check, exact=True).count() == 1
                assert page.locator('.browser-runtime-summary').count() == (state in ['imported', 'empty']), state
                assert not page.evaluate('document.documentElement.scrollWidth>innerWidth'), (width, state)
                assert not writes()  # Expanding Details never probes.
                if width == 1100 and state in ['ready', 'first', 'unverified']:
                    page.screenshot(path='/tmp/haish-browser-settings-' + state + '.png')
                print('PASS layout', width, state, info['label'])

        for width in [1100, 390]:
            page.set_viewport_size({'width': width, 'height': 820})
            for state, label, expected in [
                ('ready', 'Pause', 'Pause automation'),
                ('ready', 'Disable', 'Use personal Chrome'),
                ('paused', 'Resume', 'Resume automation'),
            ]:
                for interaction in ['hover', 'keyboard']:
                    open_state(state)
                    button = page.get_by_role('button', name=label, exact=True)
                    assert page.get_by_role('tooltip').count() == 0
                    if interaction == 'hover':
                        button.hover()
                    else:
                        page.mouse.move(0, 0)
                        for _ in range(8):
                            page.keyboard.press('Tab')
                            if button.evaluate('(el) => el === document.activeElement'):
                                break
                        assert button.evaluate('(el) => el === document.activeElement')
                    tooltip = page.get_by_role('tooltip')
                    tooltip.wait_for()
                    page.wait_for_timeout(250)
                    assert tooltip.inner_text() == expected
                    tooltip_id = tooltip.get_attribute('id')
                    assert button.get_attribute('aria-describedby') == tooltip_id
                    assert not writes()  # Explaining the action must not dispatch it.
                    bounds = tooltip.bounding_box()
                    assert bounds['x'] >= -1 and bounds['x'] + bounds['width'] <= width + 1, bounds
                    assert not page.evaluate('document.documentElement.scrollWidth>innerWidth')
                    if interaction == 'keyboard':
                        page.keyboard.press('Tab')
                    else:
                        page.mouse.move(0, 0)
                    page.locator(f'[role="tooltip"][id="{tooltip_id}"]').wait_for(state='hidden')
                    print('PASS action tooltip', width, state, label, interaction)

        page.set_viewport_size({'width': 1100, 'height': 820})
        for state, label, action in [('ready', 'Pause', 'pause'), ('paused', 'Resume', 'resume'), ('ready', 'Disable', 'disable')]:
            open_state(state)
            page.get_by_role('button', name=label, exact=True).click()
            expect_write(action)
            page.get_by_role('tooltip').wait_for(state='hidden')
            print('PASS unchanged action dispatch', action)

        for state in ['ready', 'unverified', 'disabled', 'paused', 'checkFailed']:
            open_state(state)
            page.get_by_role('button', name='Details', exact=True).click()
            assert not writes()
            page.get_by_role('button', name='Check browser', exact=True).click()
            expect_write('check')
            assert page.get_by_role('checkbox').count() == 0
            print('PASS one-click check', state)
        open_state('disabled')
        page.get_by_role('button', name='Enable', exact=True).click()
        expect_write('enable')
        page.get_by_role('button', name='Disable', exact=True).wait_for()
        assert page.get_by_role('checkbox').count() == 0
        print('PASS one-click enable')
        for state, label, action in [('first', 'Install and enable', 'install'),
                                     ('prepared', 'Set up and enable', 'install'),
                                     ('missing', 'Repair dependencies', 'repair'),
                                     ('stopped', 'Keep existing logins', 'keep_existing_logins')]:
            open_state(state)
            button = page.get_by_role('button', name=label, exact=True)
            assert button.is_disabled()
            page.locator('#browser-sync-consent').click()
            assert button.is_enabled()
            button.click()
            expect_write(action, confirmed=True)
            print('PASS consent dispatch', state)
        open_state('mismatch')
        button = page.get_by_role('button', name='Update dependencies', exact=True)
        page.locator('#browser-sync-consent').click()
        assert button.is_disabled()
        page.locator('#browser-runtime-replace').click()
        assert button.is_enabled()
        button.click()
        expect_write('repair', confirmed=True, allow_replace=True)
        assert not errors, errors
        print('PASS shared-runtime replacement consent; no rendering errors')
    finally:
        browser.close()
