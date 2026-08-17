/* ==========================================================================
   WINGO EATS — admin/admin.js
   Powers the login/setup screen and the admin dashboard (restaurants +
   dishes CRUD, image uploads). Every write goes through /api/... and relies
   on the HttpOnly session cookie set by /api/login or /api/setup.
   ========================================================================== */

function escapeHtml(str) {
  var div = document.createElement('div');
  div.textContent = str == null ? '' : String(str);
  return div.innerHTML;
}

function showAlert(container, message, type) {
  container.innerHTML = '<div class="alert alert-' + (type || 'error') + '">' + escapeHtml(message) + '</div>';
}
function clearAlert(container) { container.innerHTML = ''; }

/* ---------------- Image upload widget ---------------- */
// Wires a file input + preview box; calls onDone(imageId) once uploaded.
function wireImageUpload(inputEl, previewEl, statusEl, onDone) {
  inputEl.addEventListener('change', function () {
    var file = inputEl.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (e) { previewEl.innerHTML = '<img src="' + e.target.result + '" alt="">'; };
    reader.readAsDataURL(file);

    statusEl.textContent = 'Uploading…';
    statusEl.className = 'upload-status uploading';

    var formData = new FormData();
    formData.append('image', file);

    fetch('/api/upload', { method: 'POST', body: formData })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok) {
          statusEl.textContent = result.data.error || 'Upload failed.';
          statusEl.className = 'upload-status error';
          return;
        }
        statusEl.textContent = 'Uploaded ✓';
        statusEl.className = 'upload-status';
        onDone(result.data.imageId);
      })
      .catch(function () {
        statusEl.textContent = 'Upload failed. Please try again.';
        statusEl.className = 'upload-status error';
      });
  });
}

/* ==========================================================================
   LOGIN / FIRST-TIME SETUP PAGE
   ========================================================================== */
function initAuthPage() {
  var authCard = document.getElementById('authCard');
  if (!authCard) return;

  var alertBox = document.getElementById('authAlert');
  var title = document.getElementById('authTitle');
  var subtitle = document.getElementById('authSubtitle');
  var form = document.getElementById('authForm');
  var confirmField = document.getElementById('confirmField');
  var submitBtn = document.getElementById('authSubmit');
  var usernameInput = document.getElementById('authUsername');
  var passwordInput = document.getElementById('authPassword');
  var confirmInput = document.getElementById('authConfirm');

  var mode = 'login';

  fetch('/api/setup-status')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (data.needsSetup) {
        mode = 'setup';
        title.textContent = 'Create Your Admin Account';
        subtitle.textContent = 'One-time setup — choose the username and password you\'ll use to manage Wingo Eats.';
        confirmField.style.display = 'block';
        submitBtn.textContent = 'Create Account & Log In';
      }
    })
    .catch(function () {});

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearAlert(alertBox);

    var username = usernameInput.value.trim();
    var password = passwordInput.value;

    if (mode === 'setup' && password !== confirmInput.value) {
      showAlert(alertBox, 'Passwords do not match.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = mode === 'setup' ? 'Creating…' : 'Logging in…';

    var endpoint = mode === 'setup' ? '/api/setup' : '/api/login';
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok) {
          showAlert(alertBox, result.data.error || 'Something went wrong.');
          submitBtn.disabled = false;
          submitBtn.textContent = mode === 'setup' ? 'Create Account & Log In' : 'Log In';
          return;
        }
        window.location.href = 'dashboard.html';
      })
      .catch(function () {
        showAlert(alertBox, 'Could not reach the server. Please try again.');
        submitBtn.disabled = false;
        submitBtn.textContent = mode === 'setup' ? 'Create Account & Log In' : 'Log In';
      });
  });
}

/* ---------------- Shared: require an authenticated session ---------------- */
function requireAuth(onOk) {
  fetch('/api/session')
    .then(function (res) { return res.json(); })
    .then(function (data) {
      if (!data.authenticated) {
        window.location.href = 'login.html';
        return;
      }
      var nameEl = document.getElementById('adminUsername');
      if (nameEl) nameEl.textContent = data.username;
      onOk(data);
    })
    .catch(function () { window.location.href = 'login.html'; });
}

function wireLogout() {
  var btn = document.getElementById('logoutBtn');
  if (!btn) return;
  btn.addEventListener('click', function () {
    fetch('/api/logout', { method: 'POST' }).then(function () { window.location.href = 'login.html'; });
  });
}

/* ==========================================================================
   DASHBOARD — restaurant list + add/edit form
   ========================================================================== */
function initDashboard() {
  var list = document.getElementById('restaurantList');
  if (!list) return;

  requireAuth(function () { loadRestaurants(); });
  wireLogout();

  var panel = document.getElementById('restaurantFormPanel');
  var form = document.getElementById('restaurantForm');
  var addBtn = document.getElementById('addRestaurantBtn');
  var cancelBtn = document.getElementById('cancelRestaurantBtn');
  var panelTitle = document.getElementById('restaurantFormTitle');
  var alertBox = document.getElementById('restaurantAlert');

  var idField = document.getElementById('rf_id');
  var logoImageIdField = document.getElementById('rf_logoImageId');
  var bannerImageIdField = document.getElementById('rf_bannerImageId');

  function openPanel(restaurant) {
    form.reset();
    clearAlert(alertBox);
    document.getElementById('logoPreview').innerHTML = 'Logo';
    document.getElementById('bannerPreview').innerHTML = 'Banner';
    document.getElementById('logoStatus').textContent = '';
    document.getElementById('bannerStatus').textContent = '';
    logoImageIdField.value = '';
    bannerImageIdField.value = '';

    if (restaurant) {
      panelTitle.textContent = 'Edit Restaurant';
      idField.value = restaurant.id;
      document.getElementById('rf_name').value = restaurant.name || '';
      document.getElementById('rf_cuisine').value = restaurant.cuisine || '';
      document.getElementById('rf_rating').value = restaurant.rating != null ? restaurant.rating : '';
      document.getElementById('rf_distance').value = restaurant.distance || '';
      document.getElementById('rf_prepTime').value = restaurant.prep_time || '';
      document.getElementById('rf_priceForTwo').value = restaurant.price_for_two || '';
      document.getElementById('rf_phone').value = restaurant.phone || '';
      document.getElementById('rf_address').value = restaurant.address || '';
      if (restaurant.logo_image_id) {
        logoImageIdField.value = restaurant.logo_image_id;
        document.getElementById('logoPreview').innerHTML = '<img src="/api/image/' + restaurant.logo_image_id + '" alt="">';
      }
      if (restaurant.banner_image_id) {
        bannerImageIdField.value = restaurant.banner_image_id;
        document.getElementById('bannerPreview').innerHTML = '<img src="/api/image/' + restaurant.banner_image_id + '" alt="">';
      }
    } else {
      panelTitle.textContent = 'Add Restaurant';
      idField.value = '';
    }
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function closePanel() { panel.style.display = 'none'; }

  addBtn.addEventListener('click', function () { openPanel(null); });
  cancelBtn.addEventListener('click', closePanel);

  wireImageUpload(
    document.getElementById('logoInput'),
    document.getElementById('logoPreview'),
    document.getElementById('logoStatus'),
    function (imageId) { logoImageIdField.value = imageId; }
  );
  wireImageUpload(
    document.getElementById('bannerInput'),
    document.getElementById('bannerPreview'),
    document.getElementById('bannerStatus'),
    function (imageId) { bannerImageIdField.value = imageId; }
  );

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearAlert(alertBox);

    var payload = {
      name: document.getElementById('rf_name').value.trim(),
      cuisine: document.getElementById('rf_cuisine').value.trim(),
      rating: parseFloat(document.getElementById('rf_rating').value) || 4.5,
      distance: document.getElementById('rf_distance').value.trim(),
      prepTime: document.getElementById('rf_prepTime').value.trim(),
      priceForTwo: document.getElementById('rf_priceForTwo').value.trim(),
      phone: document.getElementById('rf_phone').value.trim(),
      address: document.getElementById('rf_address').value.trim(),
      logoImageId: logoImageIdField.value || null,
      bannerImageId: bannerImageIdField.value || null
    };

    var id = idField.value;
    var url = id ? '/api/restaurants/' + id : '/api/restaurants';
    var method = id ? 'PUT' : 'POST';

    fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok) { showAlert(alertBox, result.data.error || 'Could not save restaurant.'); return; }
        closePanel();
        loadRestaurants();
      })
      .catch(function () { showAlert(alertBox, 'Could not reach the server. Please try again.'); });
  });

  function loadRestaurants() {
    list.innerHTML = '<p class="form-hint">Loading…</p>';
    fetch('/api/restaurants')
      .then(function (res) { return res.json(); })
      .then(function (data) {
        var restaurants = data.restaurants || [];
        if (restaurants.length === 0) {
          list.innerHTML = '<div class="empty-admin"><div class="emoji">🍽️</div><h3>No restaurants yet</h3><p>Click "Add Restaurant" to create your first one.</p></div>';
          return;
        }
        list.innerHTML = restaurants.map(function (r) {
          var thumb = r.logo_image_id ? '<img src="/api/image/' + r.logo_image_id + '" alt="">' : (r.name || '?').slice(0, 2).toUpperCase();
          return (
            '<div class="admin-row" data-id="' + r.id + '">' +
              '<div class="admin-row-thumb">' + thumb + '</div>' +
              '<div class="admin-row-info"><h4>' + escapeHtml(r.name) + '</h4><p>' + escapeHtml(r.cuisine || 'No cuisine set') + ' · ★ ' + r.rating + '</p></div>' +
              '<div class="admin-row-actions">' +
                '<a class="icon-btn" href="menu.html?restaurant=' + r.id + '" title="Manage menu">🍔</a>' +
                '<button class="icon-btn edit-btn" title="Edit">✏️</button>' +
                '<button class="icon-btn danger delete-btn" title="Delete">🗑️</button>' +
              '</div>' +
            '</div>'
          );
        }).join('');

        list.querySelectorAll('.edit-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.closest('.admin-row').getAttribute('data-id');
            var r = restaurants.find(function (x) { return String(x.id) === id; });
            openPanel(r);
          });
        });
        list.querySelectorAll('.delete-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var row = btn.closest('.admin-row');
            var id = row.getAttribute('data-id');
            var r = restaurants.find(function (x) { return String(x.id) === id; });
            if (!confirm('Delete "' + r.name + '" and all of its menu items? This cannot be undone.')) return;
            fetch('/api/restaurants/' + id, { method: 'DELETE' })
              .then(function () { loadRestaurants(); });
          });
        });
      })
      .catch(function () {
        list.innerHTML = '<div class="empty-admin"><div class="emoji">⚠️</div><h3>Could not load restaurants</h3></div>';
      });
  }
}

/* ==========================================================================
   MENU PAGE — dish list (grouped by category) + add/edit form
   ========================================================================== */
function initMenuPage() {
  var list = document.getElementById('dishList');
  if (!list) return;

  var params = new URLSearchParams(window.location.search);
  var restaurantId = params.get('restaurant');
  if (!restaurantId) { window.location.href = 'dashboard.html'; return; }

  requireAuth(function () { loadDishes(); });
  wireLogout();

  var panel = document.getElementById('dishFormPanel');
  var form = document.getElementById('dishForm');
  var addBtn = document.getElementById('addDishBtn');
  var cancelBtn = document.getElementById('cancelDishBtn');
  var panelTitle = document.getElementById('dishFormTitle');
  var alertBox = document.getElementById('dishAlert');
  var idField = document.getElementById('df_id');
  var imageIdField = document.getElementById('df_imageId');

  function openPanel(dish) {
    form.reset();
    clearAlert(alertBox);
    document.getElementById('dishPreview').innerHTML = 'Photo';
    document.getElementById('dishStatus').textContent = '';
    imageIdField.value = '';

    if (dish) {
      panelTitle.textContent = 'Edit Dish';
      idField.value = dish.id;
      document.getElementById('df_category').value = dish.category || '';
      document.getElementById('df_name').value = dish.name || '';
      document.getElementById('df_description').value = dish.description || '';
      document.getElementById('df_price').value = dish.price != null ? dish.price : '';
      document.getElementById('df_isVeg').checked = !!dish.is_veg;
      document.getElementById('df_isBestseller').checked = !!dish.is_bestseller;
      if (dish.image_id) {
        imageIdField.value = dish.image_id;
        document.getElementById('dishPreview').innerHTML = '<img src="/api/image/' + dish.image_id + '" alt="">';
      }
    } else {
      panelTitle.textContent = 'Add Dish';
      idField.value = '';
      document.getElementById('df_isVeg').checked = true;
    }
    panel.style.display = 'block';
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function closePanel() { panel.style.display = 'none'; }

  addBtn.addEventListener('click', function () { openPanel(null); });
  cancelBtn.addEventListener('click', closePanel);

  wireImageUpload(
    document.getElementById('dishImageInput'),
    document.getElementById('dishPreview'),
    document.getElementById('dishStatus'),
    function (imageId) { imageIdField.value = imageId; }
  );

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearAlert(alertBox);

    var payload = {
      restaurantId: restaurantId,
      category: document.getElementById('df_category').value.trim() || 'Menu',
      name: document.getElementById('df_name').value.trim(),
      description: document.getElementById('df_description').value.trim(),
      price: parseFloat(document.getElementById('df_price').value) || 0,
      isVeg: document.getElementById('df_isVeg').checked,
      isBestseller: document.getElementById('df_isBestseller').checked,
      imageId: imageIdField.value || null
    };

    var id = idField.value;
    var url = id ? '/api/dishes/' + id : '/api/dishes';
    var method = id ? 'PUT' : 'POST';

    fetch(url, { method: method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      .then(function (res) { return res.json().then(function (data) { return { ok: res.ok, data: data }; }); })
      .then(function (result) {
        if (!result.ok) { showAlert(alertBox, result.data.error || 'Could not save dish.'); return; }
        closePanel();
        loadDishes();
      })
      .catch(function () { showAlert(alertBox, 'Could not reach the server. Please try again.'); });
  });

  function loadDishes() {
    list.innerHTML = '<p class="form-hint">Loading…</p>';
    fetch('/api/restaurants/' + restaurantId)
      .then(function (res) {
        if (!res.ok) throw new Error('not found');
        return res.json();
      })
      .then(function (data) {
        document.getElementById('menuRestaurantName').textContent = data.restaurant.name;
        document.title = 'Menu — ' + data.restaurant.name + ' | Wingo Eats Admin';

        var dishes = data.dishes || [];
        if (dishes.length === 0) {
          list.innerHTML = '<div class="empty-admin"><div class="emoji">🍔</div><h3>No dishes yet</h3><p>Click "Add Dish" to build out this restaurant\'s menu.</p></div>';
          return;
        }

        var groups = {};
        var order = [];
        dishes.forEach(function (d) {
          if (!groups[d.category]) { groups[d.category] = []; order.push(d.category); }
          groups[d.category].push(d);
        });

        list.innerHTML = order.map(function (cat) {
          var rows = groups[cat].map(function (d) {
            var thumb = d.image_id ? '<img src="/api/image/' + d.image_id + '" alt="">' : '🍽️';
            return (
              '<div class="admin-row" data-id="' + d.id + '">' +
                '<div class="admin-row-thumb">' + thumb + '</div>' +
                '<div class="admin-row-info"><h4><span class="badge-veg' + (d.is_veg ? '' : ' nonveg') + '"></span> ' + escapeHtml(d.name) + (d.is_bestseller ? '<span class="badge-fire">🔥 Bestseller</span>' : '') + '</h4><p>' + escapeHtml(d.description || '') + '</p></div>' +
                '<div class="admin-row-price">₹' + d.price + '</div>' +
                '<div class="admin-row-actions">' +
                  '<button class="icon-btn edit-dish-btn" title="Edit">✏️</button>' +
                  '<button class="icon-btn danger delete-dish-btn" title="Delete">🗑️</button>' +
                '</div>' +
              '</div>'
            );
          }).join('');
          return '<div class="category-block"><h3>' + escapeHtml(cat) + '</h3>' + rows + '</div>';
        }).join('');

        list.querySelectorAll('.edit-dish-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var id = btn.closest('.admin-row').getAttribute('data-id');
            var d = dishes.find(function (x) { return String(x.id) === id; });
            openPanel(d);
          });
        });
        list.querySelectorAll('.delete-dish-btn').forEach(function (btn) {
          btn.addEventListener('click', function () {
            var row = btn.closest('.admin-row');
            var id = row.getAttribute('data-id');
            var d = dishes.find(function (x) { return String(x.id) === id; });
            if (!confirm('Delete "' + d.name + '"?')) return;
            fetch('/api/dishes/' + id, { method: 'DELETE' }).then(function () { loadDishes(); });
          });
        });
      })
      .catch(function () {
        list.innerHTML = '<div class="empty-admin"><div class="emoji">⚠️</div><h3>Could not load this restaurant</h3></div>';
      });
  }
}

/* ---------- Custom logo (optional) ----------
   Same mechanism as the public site's script.js: if /assets/logo.png
   exists, it replaces the "W" mark in the admin header automatically. */
function applyCustomLogo() {
  var marks = document.querySelectorAll('.brand-mark');
  if (!marks.length) return;
  var probe = new Image();
  probe.onload = function () {
    marks.forEach(function (el) {
      el.innerHTML = '<img src="/assets/logo.png" alt="Wingo Eats logo" style="width:100%;height:100%;object-fit:cover;border-radius:inherit;">';
    });
  };
  probe.src = '/assets/logo.png';
}

document.addEventListener('DOMContentLoaded', function () {
  applyCustomLogo();
  initAuthPage();
  initDashboard();
  initMenuPage();
});
