'use client';

// Online saving in the planner: once the team passcode is entered in a browser, the plan is
// loaded from and saved to the shared online copy, so every computer sees the same plan. Saves
// never overwrite a newer plan saved from another computer; when both changed, the user chooses.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Cloud, CloudOff, Loader2 } from 'lucide-react';
import type { Project } from '@/types/plan';
import { usePlanStore } from '@/store/usePlanStore';
import { cloudGet, cloudPut, cloudVersion, decideOnConnect, lastSync, markSynced, rememberPasscode, savedPasscode, type CloudError } from '@/lib/cloud';
import { savedFingerprint } from '@/lib/saveSync';
import { serializeProject } from '@/lib/persistence';
import { CURRENT_SAMPLE_FINGERPRINT, isOutdatedUneditedSample, projectFingerprint } from '@/lib/sampleFingerprint';

const SAVE_MS = 2000;
const POLL_MS = 15000;
const MAX_CHARS = 3_800_000;

export type OnlineStatus = 'off' | 'connecting' | 'synced' | 'saving' | 'offline' | 'wrong-passcode' | 'not-configured' | 'too-large' | 'error' | 'conflict' | 'choose';

/** The plan as uploaded: the project JSON, leaving out an imported PDF image if it would be too big. */
function uploadText(project: Project): string {
  const p = { ...project, updatedAt: new Date().toISOString() };
  const full = JSON.stringify(p);
  if (full.length <= MAX_CHARS || !p.background) return full;
  return JSON.stringify(JSON.parse(serializeProject(p, { includeBackground: false })));
}

const isStarter = (p: Project) => {
  const raw = JSON.parse(JSON.stringify(p));
  return projectFingerprint(raw) === CURRENT_SAMPLE_FINGERPRINT || isOutdatedUneditedSample(raw);
};

export function useOnlineSync(o: { ready: boolean; adoptOnline: (raw: string) => Promise<void> }) {
  const project = usePlanStore((s) => s.project);
  const st = usePlanStore.getState;
  const [status, setStatus] = useState<OnlineStatus>('off');
  const [remote, setRemote] = useState<{ plan: string; etag: string | null } | null>(null);
  const pass = useRef<string | null>(null);
  const etag = useRef<string | null>(null);
  /** The project last synced with the online plan (nothing to upload while equal). */
  const synced = useRef<Project | null>(null);
  const busy = useRef(false);

  const settle = useCallback((p: Project, tag: string, text: string) => {
    synced.current = p;
    etag.current = tag;
    markSynced({ etag: tag, fp: savedFingerprint(text) });
  }, []);

  const adopt = useCallback(
    async (plan: string, tag: string | null) => {
      await o.adoptOnline(plan);
      const p = st().project;
      settle(p, tag ?? '', JSON.stringify(p));
      setRemote(null);
      setStatus('synced');
    },
    [o, st, settle],
  );

  const upload = useCallback(
    async (force = false) => {
      if (!pass.current) return;
      const p = st().project;
      const text = uploadText(p);
      setStatus('saving');
      const r = await cloudPut(pass.current, text, etag.current, force);
      if (r.ok) {
        settle(p, r.etag, JSON.stringify(p));
        setRemote(null);
        setStatus('synced');
      } else if (r.error === 'conflict') {
        if (r.plan && st().project === synced.current) await adopt(r.plan, r.etag);
        else {
          setRemote(r.plan ? { plan: r.plan, etag: r.etag } : null);
          setStatus('conflict');
        }
      } else setStatus(r.error as CloudError);
    },
    [st, settle, adopt],
  );

  const connect = useCallback(
    async (code: string) => {
      pass.current = code;
      setStatus('connecting');
      const r = await cloudGet(code);
      if (!r.ok) {
        if (r.error === 'wrong-passcode') rememberPasscode(null);
        setStatus(r.error);
        return;
      }
      rememberPasscode(code);
      const p = st().project;
      const localText = JSON.stringify(p);
      const decision = decideOnConnect({
        cloudPlanFp: r.plan ? savedFingerprint(r.plan) : null,
        cloudEtag: r.etag,
        mark: lastSync(),
        localFp: savedFingerprint(localText),
        localIsStarter: isStarter(p),
      });
      etag.current = r.etag;
      if (decision === 'adopt' && r.plan) await adopt(r.plan, r.etag);
      else if (decision === 'in-sync' && r.etag) {
        settle(p, r.etag, localText);
        setStatus('synced');
      } else if (decision === 'choose' && r.plan) {
        setRemote({ plan: r.plan, etag: r.etag });
        setStatus('choose');
      } else await upload();
    },
    [st, adopt, settle, upload],
  );

  // Connect on load when this browser already has the passcode.
  useEffect(() => {
    if (!o.ready) return;
    const code = savedPasscode();
    if (code) connect(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [o.ready]);

  // Save changes online a moment after they are made.
  useEffect(() => {
    if (status !== 'synced' && status !== 'offline' && status !== 'error') return;
    if (project === synced.current) return;
    const t = setTimeout(() => {
      if (!busy.current) {
        busy.current = true;
        upload().finally(() => (busy.current = false));
      }
    }, SAVE_MS);
    return () => clearTimeout(t);
  }, [project, status, upload]);

  // Pick up a plan saved from another computer (every few seconds while the page is in view).
  useEffect(() => {
    if (status !== 'synced') return;
    const check = async () => {
      if (busy.current || !pass.current || document.visibilityState !== 'visible') return;
      busy.current = true;
      try {
        const v = await cloudVersion(pass.current);
        if (v.ok && v.etag && v.etag !== etag.current) {
          const r = await cloudGet(pass.current);
          if (r.ok && r.plan) {
            if (st().project === synced.current) await adopt(r.plan, r.etag);
            else {
              setRemote({ plan: r.plan, etag: r.etag });
              setStatus('conflict');
            }
          }
        }
      } finally {
        busy.current = false;
      }
    };
    const timer = setInterval(check, POLL_MS);
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [status, st, adopt]);

  const loadOnline = useCallback(async () => {
    if (remote) await adopt(remote.plan, remote.etag);
  }, [remote, adopt]);
  const keepLocal = useCallback(async () => {
    etag.current = remote?.etag ?? etag.current;
    await upload(true);
  }, [remote, upload]);
  const signIn = useCallback(() => {
    const code = window.prompt('Team passcode for saving the plan online:');
    if (code && code.trim()) connect(code.trim());
  }, [connect]);
  const signOut = useCallback(() => {
    if (!window.confirm('Stop saving online in this browser? The plan stays here, and the online copy is kept.')) return;
    rememberPasscode(null);
    markSynced(null);
    pass.current = null;
    setStatus('off');
  }, []);

  return { status, remote, loadOnline, keepLocal, signIn, signOut, retry: () => pass.current && connect(pass.current) };
}

const LABEL: Record<OnlineStatus, string> = {
  off: 'Save online',
  connecting: 'Connecting…',
  synced: 'Saved online',
  saving: 'Saving online…',
  offline: 'Offline – saved here',
  'wrong-passcode': 'Wrong passcode',
  'not-configured': 'Online saving not set up',
  'too-large': 'Plan too large to save online',
  error: 'Online save failed',
  conflict: 'Changed elsewhere',
  choose: 'Choose a plan',
};

export function OnlineButton({ sync }: { sync: ReturnType<typeof useOnlineSync> }) {
  const s = sync.status;
  const good = s === 'synced';
  const busy = s === 'connecting' || s === 'saving';
  const bad = s === 'wrong-passcode' || s === 'not-configured' || s === 'error' || s === 'too-large' || s === 'offline';
  const onClick = () => {
    if (s === 'off' || s === 'wrong-passcode') sync.signIn();
    else if (good) sync.signOut();
    else if (bad) sync.retry();
  };
  return (
    <button
      className={`flex items-center gap-1 rounded border px-1.5 py-0.5 ${good ? 'border-teal-300 text-teal-700' : bad ? 'border-amber-300 text-amber-800' : 'border-slate-300 text-slate-600'} hover:bg-slate-50`}
      title={
        s === 'off'
          ? 'Save the plan online so every computer sees the same plan (needs the team passcode)'
          : good
            ? 'Every change is saved online. Click to stop saving online in this browser.'
            : s === 'not-configured'
              ? 'Online storage or the team passcode is not set up on the website yet'
              : LABEL[s]
      }
      onClick={onClick}
    >
      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : bad || s === 'off' ? <CloudOff className="h-3 w-3" /> : <Cloud className="h-3 w-3" />}
      {LABEL[s]}
    </button>
  );
}

export function OnlineChoiceBar({ sync }: { sync: ReturnType<typeof useOnlineSync> }) {
  if (sync.status !== 'choose' && sync.status !== 'conflict') return null;
  const when = (raw: string | undefined) => {
    try {
      const t = raw ? JSON.parse(raw).updatedAt : null;
      return t ? new Date(t).toLocaleString() : 'unknown';
    } catch {
      return 'unknown';
    }
  };
  const choose = sync.status === 'choose';
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 border-b border-sky-300 bg-sky-50 px-3 py-1.5 text-xs text-sky-900">
      <span className="font-semibold">
        {choose ? 'The online plan and the plan on this computer are different.' : 'The online plan was changed from another computer while you were editing here.'}
      </span>
      <span>The online plan was last saved {when(sync.remote?.plan)}.</span>
      <span className="ml-auto flex gap-1.5">
        <button className="rounded bg-navy px-2 py-0.5 font-semibold text-white hover:opacity-90" onClick={() => sync.loadOnline()}>
          Use the online plan
        </button>
        <button
          className="rounded border border-sky-400 bg-white px-2 py-0.5 font-semibold text-sky-900 hover:bg-sky-100"
          onClick={() => {
            if (window.confirm("Put this computer's plan online? It replaces the online plan for everyone.")) sync.keepLocal();
          }}
        >
          Put this computer&apos;s plan online
        </button>
      </span>
    </div>
  );
}
