"""
Wraps Supabase calls with a small retry loop. Windows' HTTP/2 socket handling is known to be
flaky under concurrent load (WinError 10054/10035) — this absorbs those transient drops instead
of letting one flaky write kill a 60-record batch partway through.
"""

import time


def with_retry(fn, attempts=5, base_delay=1.0):
    """fn is a zero-arg callable, e.g. lambda: supabase.table('actions').insert(row).execute()"""
    last_err = None
    for i in range(attempts):
        try:
            return fn()
        except Exception as e:  # noqa: BLE001
            last_err = e
            time.sleep(base_delay * (i + 1))
    raise last_err