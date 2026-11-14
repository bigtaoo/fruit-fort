import json,sys,statistics as st

def load(p):
    with open(p,encoding='utf-8') as f: return json.load(f)

def pct(v,q):
    if not v: return 0
    v=sorted(v); i=(len(v)-1)*q
    lo=int(i); hi=min(lo+1,len(v)-1); fr=i-lo
    return v[lo]*(1-fr)+v[hi]*fr

def analyze(path,label):
    d=load(path)
    rows=[]
    for s in d['sessions']:
        r={'ref':s['session_ref'][:8],'dur':s.get('duration_seconds',0),'dev':s.get('device_type'),
           'ev':s.get('event_count'),'smax':0,'qs':0,'waves':0,'maxwave':0,'build':None,
           'stuck':None,'runs':None,'run_t':0,'fence':None,'picks':0,'q':None,'fps':None}
        for ch in s['chunks']:
            for fa in ch['facts']:
                n=fa['name']; fl=fa.get('fields') or {}
                if 'build' in fl and r['build'] is None: r['build']=fl['build']
                if n=='session_time':
                    r['smax']=max(r['smax'],fl.get('s',0) or 0)
                    if fl.get('q') is not None: r['q']=fl['q']
                    if fl.get('fps') is not None: r['fps']=fl['fps']
                elif n.startswith('quit_'):
                    if (fl.get('s') or 0)>=r['qs']:
                        r['qs']=fl.get('s') or 0; r['stuck']=fl.get('stuck'); r['fence']=fl.get('fence')
                        r['maxwave']=max(r['maxwave'],fl.get('wave') or 0)
                elif n=='wave_cleared':
                    r['waves']+=1
                    r['maxwave']=max(r['maxwave'],fl.get('wave') or 0)
                elif n=='run_end':
                    r['run_t']+=fl.get('time',0) or 0
                    r['maxwave']=max(r['maxwave'],fl.get('wave') or 0)
                elif n=='load':
                    if fl.get('runs') is not None: r['runs']=fl['runs']
                elif n.startswith('wagon_pick'): r['picks']+=1
        r['play']=max(r['smax'],r['qs'])
        rows.append(r)
    print('='*70); print(label,' sessions(with session_time):',len(rows),' next_cursor:',d['page']['next_cursor'])
    builds={}
    for r in rows: builds[r['build']]=builds.get(r['build'],0)+1
    print(' builds:',builds)
    play=[r['play'] for r in rows]
    print(' play(s): n=%d mean=%.0f p25=%.0f p50=%.0f p75=%.0f p90=%.0f max=%.0f'%(
        len(play),sum(play)/len(play),pct(play,.25),pct(play,.5),pct(play,.75),pct(play,.9),max(play)))
    tr=sorted(play)[:-2]
    print(' play trimmed(drop top2): mean=%.0f p50=%.0f'%(sum(tr)/len(tr),pct(tr,.5)))
    w=[r['waves'] for r in rows]
    print(' wave_cleared/session: mean=%.2f p50=%.0f p75=%.0f p90=%.0f'%(sum(w)/len(w),pct(w,.5),pct(w,.75),pct(w,.9)))
    mw=[r['maxwave'] for r in rows]
    print(' max wave reached: mean=%.2f p50=%.0f p75=%.0f p90=%.0f'%(sum(mw)/len(mw),pct(mw,.5),pct(mw,.75),pct(mw,.9)))
    # combat share
    comb=[(r['play'],r['waves']) for r in rows if r['play']>0]
    tot_play=sum(x[0] for x in comb); tot_w=sum(x[1] for x in comb)
    print(' total play %.0f s, total waves %d -> %.0f s per wave cleared'%(tot_play,tot_w,tot_play/max(tot_w,1)))
    rt=[r['run_t'] for r in rows if r['run_t']>0]
    if rt: print(' run_end time sum present in %d sessions, median %.0f s'%(len(rt),pct(rt,.5)))
    stuck={}
    for r in rows: stuck[r['stuck']]=stuck.get(r['stuck'],0)+1
    print(' last quit stuck:',sorted(stuck.items(),key=lambda x:-x[1]))
    print(' top10 by play:')
    for r in sorted(rows,key=lambda x:-x['play'])[:10]:
        print('   %s dur=%.0f play=%.0f waves=%d maxwave=%d stuck=%s ev=%d dev=%s'%(
            r['ref'],r['dur'],r['play'],r['waves'],r['maxwave'],r['stuck'],r['ev'],r['dev']))
    # buckets
    for lo,hi in [(0,60),(60,120),(120,180),(180,300),(300,600),(600,10**9)]:
        c=sum(1 for p in play if lo<=p<hi)
        print('   %4d-%-5d s: %3d (%.0f%%)'%(lo,hi,c,100*c/len(play)))
    return rows

a=analyze(sys.argv[1],'2026-11-12..13  (0.0.29)')
b=analyze(sys.argv[2],'2026-11-09..10  (0.0.22)')
