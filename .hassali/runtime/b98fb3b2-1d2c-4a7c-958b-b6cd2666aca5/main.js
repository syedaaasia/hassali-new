const cards = document.querySelectorAll(".feature-grid article, .story, .hero-visual");

cards.forEach((card) => {
  card.addEventListener("pointermove", (event) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--x", String(event.clientX - rect.left));
    card.style.setProperty("--y", String(event.clientY - rect.top));
  });
});

if ("IntersectionObserver" in window) {
  const revealTargets = document.querySelectorAll(".hero, .feature-grid article, .story, .gallery img");
  revealTargets.forEach((element) => element.classList.add("is-waiting"));

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.16 });

  revealTargets.forEach((element) => observer.observe(element));
}
