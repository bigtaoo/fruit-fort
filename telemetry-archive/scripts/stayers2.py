import json,sys
def pct(v,q):
    if not v: return 0
    v=sorted(v); i=(len(v)-1)*q; lo=int(i); hi=min(lo+1,len(v)-1); fr=i-lo
    return v[lo]*(1-fr)+v[hi]*fr
def rows(path):
    d=json.load(open(path,encoding='utf-8')); out=[]
    for s in d['sessions']:
        r={'dur':s.get('duration_seconds',0),'ev':s.get('event_count',0),'smax':0,'qs':0,
           'waves':0,'maxwave':0,'stuck':None,'fence':None,'buys':0,'picks':0,'runs':0,'heroes':set()}
        for ch in s['chunks']:
            for fa in ch['facts']:
                n=fa['name']; f=fa.get('fields') or {}
                if n=='session_time': r['smax']=max(r['smax'],f.get('s',0) or 0)
                elif n.startswith('quit_'):
                    if (f.get('s') or 0)>=r['qs']:
                        r['qs']=f.get('s') or 0; r['stuck']=f.get('stuck'); r['fence']=f.get('fence')
                        if f.get('buys') is not None: r['buys']=f['buys']
                    r['maxwave']=max(r['maxwave'],f.get('wave') or 0)
                elif n=='wave_cleared':
                    r['waves']+=1; r['maxwave']=max(r['maxwave'],f.get('wave') or 0)
                elif n=='run_start': r['runs']+=1
                elif n=='run_end': r['maxwave']=max(r['maxwave'],f.get('wave') or 0)
        r['play']=max(r['smax'],r['qs']); out.append(r)
    return out
def rep(path,label):
    R=rows(path)
    print('='*72); print(label)
    def line(tag,sel):
        g=[r for r in R if sel(r)]
        if not g: print('  %-28s n=0'%tag); return
        p=[r['play'] for r in g]; w=[r['waves'] for r in g]; mw=[r['maxwave'] for r in g]
        print('  %-28s n=%-3d  play p50=%-5.0f p75=%-5.0f p90=%-6.0f | waves p50=%-3.0f mean=%.2f | maxwave p50=%.0f'%(
            tag,len(g),pct(p,.5),pct(p,.75),pct(p,.9),pct(w,.5),sum(w)/len(w),pct(mw,.5)))
    line('all stayers (>=30 s)',lambda r:True)
    line('  minus idle tabs (ev>=15)',lambda r:r['ev']>=15)
    line('  reached wave 2+',lambda r:r['maxwave']>=2)
    line('  reached wave 5+',lambda r:r['maxwave']>=5)
    line('  cleared level (stuck=done)',lambda r:r['stuck']=='done')
    sec=[r['play']/r['waves'] for r in R if r['waves']>=2 and r['ev']>=15]
    print('  seconds per wave cleared (waves>=2, ev>=15): n=%d p50=%.0f'%(len(sec),pct(sec,.5)))
    rr=[r['runs'] for r in R if r['ev']>=15]
    print('  runs started per active stayer: p50=%.0f mean=%.2f  (n=%d)'%(pct(rr,.5),sum(rr)/max(len(rr),1),len(rr)))
    st={}
    for r in R:
        if r['ev']>=15: st[r['stuck']]=st.get(r['stuck'],0)+1
    print('  last quit (active only):',sorted(st.items(),key=lambda x:-x[1]))
    fe=[r['fence'] for r in R if r['ev']>=15 and r['fence'] is not None]
    if fe: print('  fence at last quit: p50=%.0f p25=%.0f n=%d'%(pct(fe,.5),pct(fe,.25),len(fe)))
rep(sys.argv[1],'2026-11-12..13  (0.0.29 live, ten-wave 1-1)')
rep(sys.argv[2],'2026-11-09..10  (0.0.22 pre-wagon)')
