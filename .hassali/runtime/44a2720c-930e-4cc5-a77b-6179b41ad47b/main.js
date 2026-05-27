// Existing code retained
const cards = document.querySelectorAll('.feature-grid article, .story, .hero-visual');

cards.forEach((card) => {
  card.addEventListener('pointermove', (event) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty('--x', String(event.clientX - rect.left));
    card.style.setProperty('--y', String(event.clientY - rect.top));
  });
});

// Update the showroom name
const showroomName = 'Aasia Showroom';
// Additional functionality for the Mercedes G Wagons can be added here.
// TODO: Add images of Mercedes G Wagons from free sources.