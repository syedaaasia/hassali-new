document.addEventListener('DOMContentLoaded', () => {
    const products = [
        { name: 'Gold Necklace', price: '$200' },
        { name: 'Silver Ring', price: '$100' },
        { name: 'Diamond Earrings', price: '$300' },
        { name: 'Emerald Bracelet', price: '$250' },
        { name: 'Pearl Pendant', price: '$150' },
        { name: 'Sapphire Brooch', price: '$175' },
        { name: 'Ruby Anklet', price: '$220' },
        { name: 'Opal Cufflinks', price: '$130' },
        { name: 'Aquamarine Set', price: '$280' },
        { name: 'Topaz Hairpin', price: '$90' }
    ];

    const productGrid = document.querySelector('.product-grid');
    products.forEach(product => {
        const productItem = document.createElement('div');
        productItem.innerHTML = `<h3>${product.name}</h3><p>${product.price}</p>`;
        productGrid.appendChild(productItem);
    });
});

const revealTargets = document.querySelectorAll(".hero, section, article, .card, .product-card, .feature-card, .collection-card");

if ("IntersectionObserver" in window) {
  revealTargets.forEach((element) => element.classList.add("hassali-reveal"));

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("is-visible");
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });

  revealTargets.forEach((element) => revealObserver.observe(element));
}

const carouselCards = Array.from(document.querySelectorAll(".carousel-card"));
let carouselIndex = Math.max(0, carouselCards.findIndex((card) => card.classList.contains("is-active")));

function showCarouselCard(nextIndex) {
  if (carouselCards.length === 0) {
    return;
  }

  carouselIndex = (nextIndex + carouselCards.length) % carouselCards.length;
  carouselCards.forEach((card, index) => {
    card.classList.toggle("is-active", index === carouselIndex);
  });
}

document.querySelector('[data-carousel="prev"]')?.addEventListener("click", () => {
  showCarouselCard(carouselIndex - 1);
});

document.querySelector('[data-carousel="next"]')?.addEventListener("click", () => {
  showCarouselCard(carouselIndex + 1);
});
