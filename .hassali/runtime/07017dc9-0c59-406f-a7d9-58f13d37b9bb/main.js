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