// Reports what loaded, so tests can read it from inside the sandboxed frame.
localStorage.setItem('fixtureVisits', String(Number(localStorage.getItem('fixtureVisits') || 0) + 1));
document.fonts.load("900 32px 'Doto'").then((faces) => {
  document.getElementById('status').textContent = JSON.stringify({
    d3: typeof d3 === 'undefined' ? null : d3.version,
    doto: faces.length > 0,
    visits: localStorage.getItem('fixtureVisits'),
  });
});
