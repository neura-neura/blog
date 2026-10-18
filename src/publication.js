// A successful Contents write precedes the Pages deployment and CDN propagation.
export async function waitForPublication({api, sha, url, version, onState = () => {}, fetchImpl = globalThis.fetch.bind(globalThis), delay = ms => new Promise(r => setTimeout(r,ms)), attempts = 60, interval = 6000}) {
  for(let attempt=0;attempt<attempts;attempt++) {
    let run;
    try { run=await api.getDeploymentStatus(sha); } catch { /* Contents-only tokens can still verify the public page. */ }
    if(url) {
      try {
        const probe=new URL(url);
        probe.searchParams.set('v',version);
        probe.searchParams.set('check',String(Date.now()));
        const response=await fetchImpl(probe.href,{cache:'no-store'});
        const html=response.ok ? await response.text() : '';
        if(html.includes(`<meta name="article-version" content="${version}">`)) {
          probe.searchParams.delete('check');
          const state={status:'ready',url:probe.href};onState(state);return state;
        }
      } catch { /* Retry transient network failures and Pages propagation. */ }
    } else if(run?.status==='completed' && run.conclusion==='success') {
      const state={status:'ready'};onState(state);return state;
    }
    if(run?.status==='completed' && ['failure','timed_out','action_required'].includes(run.conclusion)) {
      const state={status:'failed',actionsUrl:run.url};onState(state);return state;
    }
    onState({status:'waiting',actionsUrl:run?.url});
    if(attempt<attempts-1)await delay(interval);
  }
  const state={status:'pending'};onState(state);return state;
}
