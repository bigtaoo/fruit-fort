import json,sys,re
def rep(p,label):
    d=json.load(open(p,encoding='utf-8'))
    S=[s for s in d['sessions'] if s.get('event_count',0)>=15]
    c={}
    for s in S:
        for ch in s['chunks']:
            for fa in ch['facts']: c[fa['name']]=c.get(fa['name'],0)+1
    g=lambda k:c.get(k,0)
    print('='*70); print(label,' active stayers n=%d'%len(S))
    sh,gr,ms=g('happening_shown'),g('happening_grabbed'),g('happening_missed')
    print(' happenings: shown %d  grabbed %d (%.0f%%)  missed %d (%.0f%%)  -> %.1f shown/session'%(
        sh,gr,100*gr/max(sh,1),ms,100*ms/max(sh,1),sh/len(S)))
    off=sum(g('wagon_offer_%d'%i) for i in range(1,9)); pick=sum(v for k,v in c.items() if k.startswith('wagon_pick_'))
    if off:
        print(' wagons: offers %d, picks %d (%.0f%%)  offers/session %.1f'%(off,pick,100*pick/off,off/len(S)))
        print('   offer depth:',{i:g('wagon_offer_%d'%i) for i in range(1,9) if g('wagon_offer_%d'%i)})
        print('   picks:',{k.replace('wagon_pick_',''):v for k,v in sorted(c.items()) if k.startswith('wagon_pick_')})
    print(' guides (shown -> done / left / skipped):')
    ids=sorted({re.sub(r'_(shown|done|left|skipped|replaced)$','',k) for k in c if k.startswith('guide_')})
    for i in ids:
        s_=c.get(i+'_shown',0)
        if s_<4: continue
        print('   %-22s shown %3d  done %3d (%3.0f%%)  left %3d  skipped %3d  replaced %3d'%(
            i,s_,c.get(i+'_done',0),100*c.get(i+'_done',0)/s_,c.get(i+'_left',0),c.get(i+'_skipped',0),c.get(i+'_replaced',0)))
    print(' village opened: %d sessions-events | run_quit %d | ad_rewarded %d | boot_left %d'%(
        g('funnel_village_open'),g('run_quit'),g('ad_rewarded'),g('boot_left')))
rep(sys.argv[1],'0.0.29  11-12..13')
rep(sys.argv[2],'0.0.22  11-09..10')
