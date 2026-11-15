ST.renderHeader('home');
document.getElementById('ic1').innerHTML = ST.icon('layers');
document.getElementById('ic2').innerHTML = ST.icon('chart');
document.getElementById('ic3').innerHTML = ST.icon('shield');
ST.api('/meta').then(({ categories }) => {
  document.getElementById('cat-chips').innerHTML = categories.map((c) => `<span class="chip">${ST.esc(c.name)}</span>`).join('');
}).catch(() => {});
