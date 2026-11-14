import json,sys
STEPS=['first_frame','first_tap','first_buy','first_reverse','first_cast','first_grab','wave_3','wave_5','wave_10']
def rep(p,label):
    d=json.load(open(p,encoding='utf-8'))
    S=[s for s in d['sessions'] if s.get('event_count',0)>=15]
    names={}
    hit={k:0 for k in STEPS}
    for s in S:
        seen=set()
        for ch in s['chunks']:
            for fa in ch['facts']:
                n=fa['name']; names[n]=names.get(n,0)+1
                seen.add(n[7:] if n.startswith('funnel_') else n)
        for k in STEPS:
            if k in seen: hit[k]+=1
    print('='*70); print(label,' active stayers n=%d'%len(S))
    for k in STEPS: print('   %-14s %3d  (%3.0f%%)'%(k,hit[k],100*hit[k]/len(S)))
    print('   all event names seen:',sorted(names))
rep(sys.argv[1],'0.0.29  11-12..13')
rep(sys.argv[2],'0.0.22  11-09..10')
