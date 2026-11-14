import json,sys,random,math
random.seed(7)
def pct(v,q):
    v=sorted(v); i=(len(v)-1)*q; lo=int(i); hi=min(lo+1,len(v)-1); fr=i-lo
    return v[lo]*(1-fr)+v[hi]*fr
def rows(path):
    d=json.load(open(path,encoding='utf-8')); out=[]
    for s in d['sessions']:
        r={'ev':s.get('event_count',0),'smax':0,'qs':0,'waves':0,'maxwave':0,'stuck':None}
        for ch in s['chunks']:
            for fa in ch['facts']:
                n=fa['name']; f=fa.get('fields') or {}
                if n=='session_time': r['smax']=max(r['smax'],f.get('s',0) or 0)
                elif n.startswith('quit_'):
                    if (f.get('s') or 0)>=r['qs']: r['qs']=f.get('s') or 0; r['stuck']=f.get('stuck')
                    r['maxwave']=max(r['maxwave'],f.get('wave') or 0)
                elif n=='wave_cleared': r['waves']+=1; r['maxwave']=max(r['maxwave'],f.get('wave') or 0)
        r['play']=max(r['smax'],r['qs']); out.append(r)
    return [r for r in out if r['ev']>=15]
A=rows(sys.argv[1]); B=rows(sys.argv[2])   # A=0.0.29, B=0.0.22
a=[r['play'] for r in A]; b=[r['play'] for r in B]
print('n: 0.0.29=%d  0.0.22=%d'%(len(a),len(b)))
print('median: %.0f vs %.0f  (diff %+.0f s)'%(pct(a,.5),pct(b,.5),pct(a,.5)-pct(b,.5)))
d=[pct(random.choices(a,k=len(a)),.5)-pct(random.choices(b,k=len(b)),.5) for _ in range(20000)]
d.sort(); print('bootstrap 95%% CI on median diff: %+.0f s .. %+.0f s'%(d[500],d[19500]))
print('  -> i.e. anything from %.0f%% worse to %.0f%% better is consistent with this data'%(
    100*d[500]/pct(b,.5),100*d[19500]/pct(b,.5)))
# waves cleared mean
wa=[r['waves'] for r in A]; wb=[r['waves'] for r in B]
dw=[sum(random.choices(wa,k=len(wa)))/len(wa)-sum(random.choices(wb,k=len(wb)))/len(wb) for _ in range(20000)]
dw.sort(); print('waves/session mean diff %+.2f, 95%% CI %+.2f .. %+.2f'%(
    sum(wa)/len(wa)-sum(wb)/len(wb),dw[500],dw[19500]))
# completion proportion
ca=sum(1 for r in A if r['stuck']=='done'); cb=sum(1 for r in B if r['stuck']=='done')
pa,pb=ca/len(A),cb/len(B)
se=math.sqrt(pa*(1-pa)/len(A)+pb*(1-pb)/len(B))
print('cleared level: %d/%d=%.0f%% vs %d/%d=%.0f%%  diff %+.1f pp, 95%% CI %+.1f .. %+.1f pp'%(
    ca,len(A),100*pa,cb,len(B),100*pb,100*(pa-pb),100*(pa-pb-1.96*se),100*(pa-pb+1.96*se)))
# minimum detectable effect on the median, given this spread
print()
print('what sample size would it take (Mann-Whitney-ish, 80%% power, a=.05)?')
import statistics
pool=sorted(a+b)
for lift in (0.15,0.30,0.50):
    # simulate: shift arm A by lift, find n where test detects it 80% of the time
    def trial(n):
        hit=0
        for _ in range(400):
            x=[v*(1+lift) for v in random.choices(pool,k=n)]; y=random.choices(pool,k=n)
            # rank-sum
            allv=sorted([(v,0) for v in x]+[(v,1) for v in y])
            rx=sum(i+1 for i,(v,g) in enumerate(allv) if g==0)
            u=rx-n*(n+1)/2; mu=n*n/2; sd=math.sqrt(n*n*(2*n+1)/12)
            if abs((u-mu)/sd)>1.96: hit+=1
        return hit/400
    n=60
    while n<6000 and trial(n)<0.8: n=int(n*1.6)
    print('  +%d%% median lift needs ~%d engaged sessions per arm (now: ~60 per 2 days)'%(lift*100,n))
