/* ==========================================================================
   WINGO EATS — app.js
   Fetches live data from the /api endpoints and renders the public pages.
   (Admin editing lives separately in /admin/admin.js)
   ========================================================================== */

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.wingoeats.userapp&pcampaignid=web_share';

const CATEGORY_EMOJI = {
  burger: '🍔', burgers: '🍔', pizza: '🍕', chicken: '🍗', 'fried chicken': '🍗',
  beverage: '🥤', beverages: '🥤', meal: '🍛', meals: '🍛', dessert: '🍨', desserts: '🍨',
  shake: '🥤', shakes: '🥤', mojito: '🍹', mojitos: '🍹', starter: '🍢', starters: '🍢', cafe: '☕'
};

function emojiFor(text) {
  var key = (text || '').toLowerCase().trim();
  if (CATEGORY_EMOJI[key]) return CATEGORY_EMOJI[key];
  for (var k in CATEGORY_EMOJI) {
    if (key.indexOf(k) !== -1) return CATEGORY_EMOJI[k];
  }
  return '🍽️';
}

function initials(name) {
  var parts = (name || '').trim().split(/\s+/);
  var first = parts[0] ? parts[0][0] : '';
  var second = parts[1] ? parts[1][0] : (parts[0] ? parts[0][1] || '' : '');
  return (first + second).toUpperCase();
}

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function starSvg() {
  return '<svg viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z"/></svg>';
}

function restaurantCardHtml(r) {
  var mediaContent = r.banner_image_id
    ? '<img class="img-cover" src="/api/image/' + r.banner_image_id + '" alt="' + escapeHtml(r.name) + '">'
    : '<div class="ph-block food">' + emojiFor(r.cuisine) + '</div>';
  var logoContent = r.logo_image_id
    ? '<img class="logo-img" src="/api/image/' + r.logo_image_id + '" alt="">'
    : initials(r.name);

  return (
    '<article class="ticket rest-card reveal in" data-name="' + escapeHtml(r.name).toLowerCase() + '" data-cuisine="' + escapeHtml(r.cuisine || '').toLowerCase() + '">' +
      '<div class="ticket-media">' + mediaContent + '<div class="rest-logo">' + logoContent + '</div></div>' +
      '<div class="ticket-perf"></div>' +
      '<div class="ticket-body">' +
        '<div class="rest-name-row"><h3>' + escapeHtml(r.name) + '</h3><span class="rating-pill">' + starSvg() + (r.rating != null ? r.rating.toFixed ? r.rating.toFixed(1) : r.rating : '4.5') + '</span></div>' +
        '<p class="rest-cuisine">' + escapeHtml(r.cuisine || 'Restaurant') + '</p>' +
        '<div class="rest-meta">' +
          (r.distance ? '<span>📍 ' + escapeHtml(r.distance) + '</span>' : '') +
          (r.prep_time ? '<span>⏱ ' + escapeHtml(r.prep_time) + '</span>' : '') +
        '</div>' +
        '<a href="restaurant.html?id=' + r.id + '" class="btn btn-primary btn-sm btn-block">View Menu</a>' +
      '</div>' +
    '</article>'
  );
}

function skeletonCards(n) {
  var html = '';
  for (var i = 0; i < n; i++) html += '<div class="ticket skeleton skeleton-card"></div>';
  return html;
}

/* ---------------- Homepage ---------------- */
function initHomepage() {
  var grid = document.getElementById('restaurantGrid');
  var noResults = document.getElementById('noResults');
  var searchInput = document.getElementById('searchInput');
  var searchBtn = document.getElementById('searchBtn');
  if (!grid) return;

  var debounceTimer = null;

  function load(query) {
    grid.innerHTML = skeletonCards(6);
    if (noResults) noResults.style.display = 'none';

    var url = '/api/restaurants' + (query ? '?q=' + encodeURIComponent(query) : '');
    fetch(url)
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var restaurants = data.restaurants || [];
        if (restaurants.length === 0) {
          grid.innerHTML = '';
          if (noResults) noResults.style.display = 'block';
          return;
        }
        grid.innerHTML = restaurants.map(restaurantCardHtml).join('');
      })
      .catch(function () {
        grid.innerHTML = '<div class="empty-state"><div class="emoji">⚠️</div><h3>Couldn\'t load restaurants</h3><p>Please refresh the page.</p></div>';
      });
  }

  load('');

  if (searchInput) {
    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      var q = searchInput.value;
      debounceTimer = setTimeout(function () { load(q); }, 300);
    });
    searchInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); clearTimeout(debounceTimer); load(searchInput.value); }
    });
  }
  if (searchBtn) {
    searchBtn.addEventListener('click', function () { load(searchInput ? searchInput.value : ''); });
  }
}

/* ---------------- Restaurant page ---------------- */
function dishCardHtml(d) {
  var thumb = d.image_id
    ? '<img class="img-cover" src="/api/image/' + d.image_id + '" alt="' + escapeHtml(d.name) + '">'
    : emojiFor(d.subcategory || d.category);
  return (
    '<div class="ticket menu-card reveal in">' +
      '<div class="thumb ph-block food">' + thumb + (d.is_bestseller ? '<span class="badge-best">🔥 Bestseller</span>' : '') + '</div>' +
      '<div class="ticket-body">' +
        '<div class="menu-card-top">' +
          '<div><h4>' + escapeHtml(d.name) + '</h4></div>' +
          '<div class="menu-card-actions">' +
            '<span class="veg-dot' + (d.is_veg ? '' : ' nonveg') + '"></span>' +
            '<a class="menu-order-btn" href="' + PLAY_STORE_URL + '">🛒 Order</a>' +
          '</div>' +
        '</div>' +
        (d.description ? '<p class="desc">' + escapeHtml(d.description) + '</p>' : '') +
        '<span class="price">₹' + (d.price % 1 === 0 ? d.price : d.price.toFixed(2)) + '</span>' +
      '</div>' +
    '</div>'
  );
}

function groupDishesByCategory(dishes) {
  var catOrder = [];
  var catMap = {};
  dishes.forEach(function (d) {
    if (!catMap[d.category]) { catMap[d.category] = { order: [], map: {} }; catOrder.push(d.category); }
    var bucket = catMap[d.category];
    var sub = (d.subcategory || '').trim();
    if (!bucket.map[sub]) { bucket.map[sub] = []; bucket.order.push(sub); }
    bucket.map[sub].push(d);
  });
  return catOrder.map(function (cat) {
    var bucket = catMap[cat];
    return {
      category: cat,
      subgroups: bucket.order.map(function (sub) { return { subcategory: sub, items: bucket.map[sub] }; })
    };
  });
}

function slugify(str) {
  return 'cat-' + (str || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function initRestaurantPage() {
  var root = document.getElementById('restaurantRoot');
  if (!root) return;

  var params = new URLSearchParams(window.location.search);
  var id = params.get('id');

  if (!id) {
    root.innerHTML = '<div class="empty-state"><div class="emoji">🍽️</div><h3>No restaurant selected</h3><p><a href="index.html">Go back to Wingo Eats</a></p></div>';
    return;
  }

  fetch('/api/restaurants/' + id)
    .then(function (res) {
      if (!res.ok) throw new Error('not found');
      return res.json();
    })
    .then(function (data) {
      renderRestaurant(data.restaurant, data.dishes);
      loadSimilar(data.restaurant);
    })
    .catch(function () {
      root.innerHTML = '<div class="empty-state"><div class="emoji">⚠️</div><h3>Restaurant not found</h3><p><a href="index.html">Go back to Wingo Eats</a></p></div>';
    });
}

function renderRestaurant(r, dishes) {
  document.title = r.name + ' — Menu | Wingo Eats';

  var banner = document.getElementById('rBanner');
  if (r.banner_image_id) {
    banner.style.backgroundImage = 'url(/api/image/' + r.banner_image_id + ')';
    banner.style.backgroundSize = 'cover';
    banner.style.backgroundPosition = 'center';
  }

  document.getElementById('rLogo').innerHTML = r.logo_image_id
    ? '<img class="logo-img" src="/api/image/' + r.logo_image_id + '" alt="">'
    : initials(r.name);
  document.getElementById('rName').textContent = r.name;
  document.getElementById('rRating').innerHTML = starSvg() + (r.rating != null ? r.rating : '4.5');
  document.getElementById('rCuisine').textContent = r.cuisine || 'Restaurant';
  var priceEl = document.getElementById('rPrice');
  if (r.price_for_two) { priceEl.textContent = '₹' + r.price_for_two + ' for two'; } else { priceEl.style.display = 'none'; }

  var callBtn = document.getElementById('rCall');
  if (r.phone) { callBtn.href = 'tel:' + r.phone; } else { callBtn.style.display = 'none'; }
  var dirBtn = document.getElementById('rDirections');
  if (r.address) { dirBtn.href = 'https://maps.google.com/?q=' + encodeURIComponent(r.address); } else { dirBtn.style.display = 'none'; }

  var groups = groupDishesByCategory(dishes);
  var catNav = document.getElementById('catNavInner');
  var menuRoot = document.getElementById('menuRoot');

  if (groups.length === 0) {
    catNav.innerHTML = '';
    menuRoot.innerHTML = '<div class="empty-state"><div class="emoji">📋</div><h3>Menu coming soon</h3><p>This restaurant hasn\'t added dishes yet.</p></div>';
    return;
  }

  catNav.innerHTML = groups.map(function (g, i) {
    return '<a href="#' + slugify(g.category) + '" class="cat-nav-item' + (i === 0 ? ' active' : '') + '" data-target="' + slugify(g.category) + '">' + escapeHtml(g.category) + '</a>';
  }).join('');

  menuRoot.innerHTML = groups.map(function (g) {
    var subHtml = g.subgroups.map(function (sg) {
      var heading = sg.subcategory ? '<h3 class="submenu-heading">' + escapeHtml(sg.subcategory) + '</h3>' : '';
      return heading + '<div class="menu-grid">' + sg.items.map(dishCardHtml).join('') + '</div>';
    }).join('');
    return (
      '<div class="menu-group" id="' + slugify(g.category) + '">' +
        '<h2>' + emojiFor(g.category) + ' ' + escapeHtml(g.category) + '</h2>' +
        subHtml +
      '</div>'
    );
  }).join('');

  wireCategoryNav();
}

function loadSimilar(current) {
  var wrap = document.getElementById('similarGrid');
  if (!wrap) return;
  fetch('/api/restaurants?exclude=' + current.id + '&limit=4')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      var list = data.restaurants || [];
      if (list.length === 0) { document.getElementById('similarSection').style.display = 'none'; return; }
      wrap.innerHTML = list.map(restaurantCardHtml).join('');
    })
    .catch(function () {});
}

function wireCategoryNav() {
  var items = document.querySelectorAll('.cat-nav-item');
  var groups = document.querySelectorAll('.menu-group');

  items.forEach(function (item) {
    item.addEventListener('click', function (e) {
      e.preventDefault();
      var target = document.getElementById(item.getAttribute('data-target'));
      if (target) {
        var top = target.getBoundingClientRect().top + window.pageYOffset - 130;
        window.scrollTo({ top: top, behavior: 'smooth' });
      }
      items.forEach(function (i) { i.classList.remove('active'); });
      item.classList.add('active');
    });
  });

  if (groups.length && items.length && 'IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          var id = entry.target.getAttribute('id');
          items.forEach(function (i) { i.classList.toggle('active', i.getAttribute('data-target') === id); });
        }
      });
    }, { rootMargin: '-140px 0px -60% 0px', threshold: 0 });
    groups.forEach(function (g) { spy.observe(g); });
  }
}

document.addEventListener('DOMContentLoaded', function () {
  initHomepage();
  initRestaurantPage();
});
