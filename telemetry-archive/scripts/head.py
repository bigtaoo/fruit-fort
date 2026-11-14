import json,sys
def pct(v,q):
    if not v: return 0
    v=sorted(v); i=(len(v)-1)*q; lo=int(i); hi=min(lo+1,len(v)-1); fr=i-lo
    return v[lo]*(1-fr)+v[hi]*fr
def rows(path):
    d=json.load(open(path,encoding='utf-8')); out=[]
    for s in d['sessions']:
        r={'ev':s.get('event_count',0),'smax':0,'runs':0,'waves':0,'maxwave':0,'q':None,'buy1':0,'grab':0}
        last=None
        for ch in s['chunks']:
            for fa in ch['facts']:
                n=fa['name']; f=fa.get('fields') or {}
                if n=='session_time': r['smax']=max(r['smax'],f.get('s',0) or 0)
                elif n.startswith('quit_'):
                    if last is None or (f.get('s') or 0)>=(last.get('s') or 0): last=f
                elif n=='wave_cleared': r['waves']+=1; r['maxwave']=max(r['maxwave'],f.get('wave') or 0)
                elif n=='run_start': r['runs']+=1
                elif n=='first_buy': r['buy1']=1
                elif n=='first_grab': r['grab']=1
        r['q']=last; out.append(r)
    return [x for x in out if x['ev']>=15]
def rep(p,label):
    R=rows(p); print('='*74); print(label,'  active stayers n=%d'%len(R))
    Q=[r['q'] for r in R if r['q']]
    def dist(k,fmt='%.0f'):
        v=[q[k] for q in Q if q.get(k) is not None]
        if not v: print('   %-8s  -'%k); return
        print(('   %-8s n=%-3d p25='+fmt+' p50='+fmt+' p75='+fmt+' p90='+fmt)%(k,len(v),pct(v,.25),pct(v,.5),pct(v,.75),pct(v,.9)))
    at={}
    for q in Q: at[q.get('at')]=at.get(q.get('at'),0)+1
    print('   leave at:',sorted(at.items(),key=lambda x:-x[1]))
    for k in ('quiet','run_t','fence','wave','buys','gold','kills','bugs','card','charge','wagons'): dist(k)
    qv=[q['quiet'] for q in Q if q.get('quiet') is not None]
    if qv:
        print('   quiet>=20 s (bored/afk when they left): %d/%d = %.0f%%'%(sum(1 for x in qv if x>=20),len(qv),100*sum(1 for x in qv if x>=20)/len(qv)))
        print('   quiet<5 s  (left mid-action):            %d/%d = %.0f%%'%(sum(1 for x in qv if x<5),len(qv),100*sum(1 for x in qv if x<5)/len(qv)))
    rr=[r['runs'] for r in R]
    print('   runs/session: 1 run=%d  2=%d  3+=%d   (mean %.2f)'%(
        sum(1 for x in rr if x<=1),sum(1 for x in rr if x==2),sum(1 for x in rr if x>=3),sum(rr)/len(rr)))
    print('   ever bought: %d/%d = %.0f%%   ever grabbed: %d/%d = %.0f%%'%(
        sum(r['buy1'] for r in R),len(R),100*sum(r['buy1'] for r in R)/len(R),
        sum(r['grab'] for r in R),len(R),100*sum(r['grab'] for r in R)/len(R)))
    mw=[r['maxwave'] for r in R]
    print('   max wave histogram:',{w:mw.count(w) for w in sorted(set(mw))})
rep(sys.argv[1],'2026-11-12..13  0.0.29')
rep(sys.argv[2],'2026-11-09..10  0.0.22')
