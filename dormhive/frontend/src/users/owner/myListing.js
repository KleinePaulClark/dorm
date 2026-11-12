import { showToast } from '../../components/toast.js';
import { successDialog } from '../../components/modal.js';
import { ensureOwnerSidebarStyles, loadOwnerStylesheet, renderOwnerSidebar, updateListingCountsInSidebar } from './sidebarOwner.js';
import { withMediaAccessToken } from '../../services/mediaAccess.js';

const API = (window.DORMHIVE_API_URL ?? 'http://localhost:5000/api/v1').replace(/\/$/, '');
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('dormhive.accessToken') ?? ''}` });
const user = () => JSON.parse(localStorage.getItem('dormhive.user') ?? '{}');
const apiBase = API.replace(/\/api\/v1\/?$/, '');
const MAX_PROPERTY_PHOTO_SIZE = 2 * 1024 * 1024;
const SUPPORTED_PROPERTY_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
const DEFAULT_IMAGE_PLACEHOLDER = 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 300"><rect width="500" height="300" fill="#ecf5ef"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#4a7160" font-family="Inter,Arial,sans-serif" font-size="28">No image available</text></svg>');
const resolveImageUrl = (value = '') => {
  const url = String(value || '').trim();
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  return withMediaAccessToken(/^https?:\/\//i.test(url) ? url : `${apiBase}${url.startsWith('/') ? '' : '/'}${url}`);
};
const normalizePropertyImage = (property) => {
  const source = property.image_url || property.cover_image || (Array.isArray(property.images) && property.images[0]) || '';
  return resolveImageUrl(source);
};
const normalizePropertyImages = (property = {}) => {
  let images = property.images;
  if (typeof images === 'string') {
    try { images = JSON.parse(images); } catch { images = []; }
  }
  return [...new Set([normalizePropertyImage(property), ...(Array.isArray(images) ? images.map(resolveImageUrl) : [])].filter(Boolean))];
};
const normalizePropertyTypeLabel = (value = '') => {
  const raw = String(value ?? '').trim().toLowerCase();
  const labelMap = {
    bedspace: 'Bedspace',
    private_room: 'Solo Room',
    'solo room': 'Solo Room',
    entire_unit: 'Studio Unit',
    'studio unit': 'Studio Unit'
  };
  return labelMap[raw] ?? (raw ? raw.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : '');
};
const parseNumericValue = (value, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
};
const getOccupancySummary = (property = {}, bookings = []) => {
  const totalCapacity = Math.max(0, parseNumericValue(property.total_slots ?? 0, 0));
  const occupied = bookings.filter((booking) => {
    const bookingPropertyId = String(booking.property_id ?? booking.propertyId ?? '');
    const status = String(booking.status ?? '').toLowerCase();
    return String(property.id) === bookingPropertyId && status === 'approved';
  }).length;
  const rate = totalCapacity > 0 ? Math.min(100, Math.round((occupied / totalCapacity) * 100)) : 0;
  const label = totalCapacity > 0 && occupied >= totalCapacity ? 'Fully Occupied' : `${rate}% (${occupied}/${totalCapacity})`;
  return {
    total: totalCapacity,
    occupied,
    available: Math.max(0, totalCapacity - occupied),
    rate,
    label
  };
};
const getPropertyInquiryCount = (propertyId, bookings = []) => bookings.filter((booking) => {
  const bookingPropertyId = String(booking.property_id ?? booking.propertyId ?? '');
  const status = String(booking.status ?? '').toLowerCase();
  return String(propertyId) === bookingPropertyId && !['rejected', 'cancelled', 'archived'].includes(status);
}).length;
const escape = (value = '') => { const n = document.createElement('span'); n.textContent = value; return n.innerHTML; };
const formatMonthlyRent = (value = '') => {
  const raw = String(value ?? '').replace(/,/g, '');
  const decimalIndex = raw.indexOf('.');
  const whole = (decimalIndex < 0 ? raw : raw.slice(0, decimalIndex)).replace(/\D/g, '');
  const fraction = decimalIndex < 0 ? '' : `.${raw.slice(decimalIndex + 1).replace(/\D/g, '').slice(0, 2)}`;
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction}`;
};
const AMENITY_LABELS = {
  wifi: 'Wi-Fi',
  laundry: 'Laundry',
  kitchen: 'Kitchen',
  aircon: 'Aircon',
  pets_allowed: 'Pets allowed',
  dishwasher: 'Dishwasher',
  balcony: 'Balcony',
  parking: 'Parking',
  utilities_included: 'Utilities included',
  cable_ready: 'Cable ready'
};
const AMENITY_ICONS = {
  wifi: 'wifi-high',
  laundry: 'washing-machine',
  kitchen: 'cooking-pot',
  aircon: 'fan',
  pets_allowed: 'paw-print',
  dishwasher: 'oven',
  balcony: 'plant',
  parking: 'car',
  utilities_included: 'lightning',
  cable_ready: 'plug'
};
const formatAmenityLabel = (value = '') => AMENITY_LABELS[String(value).toLowerCase()] ?? String(value).replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
const normalizeAmenities = (item = {}) => {
  const raw = item.amenities;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((value) => String(value).toLowerCase());
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.map((value) => String(value).toLowerCase());
  } catch {}
  return String(raw).split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
};
const renderAmenitiesChips = (item = {}) => normalizeAmenities(item)
  .map((amenity) => {
    const label = formatAmenityLabel(amenity);
    return `<span class="amenity-chip" data-amenity-label="${escape(label)}" title="${escape(label)}" aria-label="${escape(label)}" tabindex="0"><i class="ph ph-${AMENITY_ICONS[amenity] ?? 'sparkle'}" aria-hidden="true"></i><span class="amenity-chip-label">${escape(label)}</span></span>`;
  })
  .join('');
const clearSession = () => { localStorage.removeItem('dormhive.accessToken'); localStorage.removeItem('dormhive.user'); };

function showPropertyPhotoViewer(property) {
  const photos = normalizePropertyImages(property);
  if (!photos.length) return;
  let photoIndex = 0;
  const viewer = document.createElement('dialog');
  viewer.className = 'portfolio-photo-viewer';
  const actions = document.createElement('div');
  actions.className = 'portfolio-photo-viewer__actions';
  const viewerImage = document.createElement('img');
  viewerImage.className = 'portfolio-photo-viewer__image';
  const stage = document.createElement('div');
  stage.className = 'portfolio-photo-viewer__stage';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'portfolio-photo-viewer__close';
  closeButton.setAttribute('aria-label', 'Close photo viewer');
  closeButton.title = 'Close viewer';
  closeButton.innerHTML = '<i class="bi bi-x-lg" aria-hidden="true"></i>';
  const previousButton = document.createElement('button');
  previousButton.type = 'button';
  previousButton.className = 'portfolio-photo-viewer__nav portfolio-photo-viewer__nav--previous';
  previousButton.setAttribute('aria-label', 'View previous photo');
  previousButton.title = 'Previous photo';
  previousButton.innerHTML = '<i class="bi bi-chevron-left" aria-hidden="true"></i>';
  const nextButton = document.createElement('button');
  nextButton.type = 'button';
  nextButton.className = 'portfolio-photo-viewer__nav portfolio-photo-viewer__nav--next';
  nextButton.setAttribute('aria-label', 'View next photo');
  nextButton.title = 'Next photo';
  nextButton.innerHTML = '<i class="bi bi-chevron-right" aria-hidden="true"></i>';
  const thumbnails = document.createElement('nav');
  thumbnails.className = 'portfolio-photo-viewer__thumbnails';
  thumbnails.setAttribute('aria-label', 'Property photos');
  const thumbnailButtons = photos.map((photo, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'portfolio-photo-viewer__thumbnail';
    button.dataset.photoIndex = String(index);
    button.setAttribute('aria-label', `View photo ${index + 1}`);
    button.setAttribute('aria-current', String(index === 0));
    const thumbnailImage = document.createElement('img');
    thumbnailImage.src = photo;
    thumbnailImage.alt = '';
    thumbnailImage.loading = 'lazy';
    button.append(thumbnailImage);
    thumbnails.append(button);
    return button;
  });

  const createActionButton = (className, label, iconName) => {
    const button = document.createElement('button');
    button.className = `portfolio-photo-viewer__action ${className}`;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<i class="bi ${iconName}" aria-hidden="true"></i>`;
    actions.append(button);
    return button;
  };
  const downloadButton = createActionButton('portfolio-photo-viewer__download', 'Download photo', 'bi-download');
  const shareButton = createActionButton('portfolio-photo-viewer__share', 'Share photo', 'bi-share');
  actions.append(closeButton);

  const renderPhoto = (nextIndex = photoIndex) => {
    photoIndex = (nextIndex + photos.length) % photos.length;
    viewerImage.src = photos[photoIndex];
    viewerImage.alt = `${property.title || 'Property'} photo ${photoIndex + 1}`;
    const hasMultiplePhotos = photos.length > 1;
    previousButton.hidden = !hasMultiplePhotos;
    nextButton.hidden = !hasMultiplePhotos;
    thumbnailButtons.forEach((button, index) => {
      const active = index === photoIndex;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-current', String(active));
    });
  };
  thumbnails.addEventListener('click', (event) => {
    const button = event.target.closest('.portfolio-photo-viewer__thumbnail');
    if (button) renderPhoto(Number(button.dataset.photoIndex));
  });
  previousButton.addEventListener('click', () => renderPhoto(photoIndex - 1));
  nextButton.addEventListener('click', () => renderPhoto(photoIndex + 1));
  downloadButton.addEventListener('click', async () => {
    try {
      const response = await fetch(photos[photoIndex]);
      if (!response.ok) throw new Error('Download failed');
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `${String(property.title || 'property').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')}-photo-${photoIndex + 1}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch {
      window.open(photos[photoIndex], '_blank', 'noopener,noreferrer');
    }
  });
  shareButton.addEventListener('click', async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: property.title || 'Property photo', url: photos[photoIndex] });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(photos[photoIndex]);
        showToast({ message: 'Photo link copied.', type: 'success' });
      } else {
        throw new Error('Sharing is unavailable.');
      }
    } catch (error) {
      if (error.name !== 'AbortError') showToast({ message: 'Could not share this photo.', type: 'error' });
    }
  });
  closeButton.addEventListener('click', () => viewer.close());
  viewer.addEventListener('click', (event) => { if (event.target === viewer) viewer.close(); });
  viewer.addEventListener('close', () => viewer.remove(), { once: true });
  viewer.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') previousButton.click();
    if (event.key === 'ArrowRight') nextButton.click();
  });
  stage.append(viewerImage, previousButton, nextButton, actions);
  viewer.append(stage, thumbnails);
  document.body.append(viewer);
  renderPhoto();
  viewer.showModal();
}

function css() {
  const stylesheet = new URL('./style/myListing.css', import.meta.url);
  stylesheet.searchParams.set('v', 'portfolio-amenity-tooltips-1');
  return loadOwnerStylesheet('listings', stylesheet);
}

export async function renderMyListing(root = document.querySelector('#app')) {
  if (!root) throw new Error('My listings page requires #app.');
  await Promise.all([css(), ensureOwnerSidebarStyles()]);
  const routeSearch = typeof window.DORMHIVE_ROUTE_SEARCH === 'string' ? window.DORMHIVE_ROUTE_SEARCH : window.location.search;
  const requestedPropertyId = new URLSearchParams(routeSearch).get('propertyId');
  const requestedAction = new URLSearchParams(routeSearch).get('action');

  root.innerHTML = `
    <div class="owner-shell">
      ${renderOwnerSidebar('myListing')}
      <div class="owner-main">
        <main class="portfolio-page">
          <section class="portfolio-content">
            <div class="portfolio-headline">
              <div class="portfolio-headline-copy">
                <p class="eyebrow">OWNER PORTFOLIO</p>
                <h1>My Property Portfolio</h1>
              </div>
            </div>

            <div class="portfolio-toolbar">
              <label class="property-search">
                <span aria-hidden="true"><i class="bi bi-search" aria-hidden="true"></i></span>
                <input type="search" placeholder="Search property" />
              </label>
              <label class="property-filter">
                <select>
                  <option value="">All property categories</option>
                  <option value="bedspace">Bedspace</option>
                  <option value="dormitory">Dormitory</option>
                  <option value="boarding_house">Boarding House</option>
                  <option value="room_for_rent">Room for Rent</option>
                  <option value="shared_apartment">Shared Apartment</option>
                  <option value="studio_unit">Studio Unit</option>
                  <option value="condominium">Condominium</option>
                  <option value="apartment">Apartment</option>
                  <option value="townhouse">Townhouse</option>
                  <option value="house">House</option>
                  <option value="duplex">Duplex</option>
                  <option value="loft">Loft</option>
                  <option value="penthouse">Penthouse</option>
                  <option value="staff_house">Staff House</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <button type="button" class="add-property">Add a New Property</button>
            </div>
            <div class="property-status-tabs" role="group" aria-label="Filter listings by archive status">
              <button type="button" class="active" data-property-status="active" aria-pressed="true">Current listings</button>
              <button type="button" data-property-status="archived" aria-pressed="false">Archived</button>
            </div>

            <div id="property-modal" class="property-modal" hidden>
              <div class="property-modal-card">
                <div class="property-modal-header">
                  <h2>Create a listing</h2>
                  <button type="button" class="modal-close">×</button>
                </div>

                <div class="form-step-indicator" id="form-step-indicator">
                  <div class="step-marker" data-step="1">
                    <span class="step-number">1</span>
                    <span class="step-label">Property Info</span>
                  </div>
                  <div class="step-connector"></div>
                  <div class="step-marker" data-step="2">
                    <span class="step-number">2</span>
                    <span class="step-label">Location</span>
                  </div>
                  <div class="step-connector"></div>
                  <div class="step-marker" data-step="3">
                    <span class="step-number">3</span>
                    <span class="step-label">Details</span>
                  </div>
                  <div class="step-connector"></div>
                  <div class="step-marker" data-step="4">
                    <span class="step-number">4</span>
                    <span class="step-label">Review</span>
                  </div>
                </div>

                <form id="property-form" enctype="multipart/form-data" novalidate>
                  <input type="hidden" name="address" />
                  <input type="hidden" name="municipality" />
                  <input type="hidden" name="barangay" />
                  <input type="hidden" name="latitude" />
                  <input type="hidden" name="longitude" />

                  <div id="property-form-step-1" class="property-form-step">
                    <div class="form-step-title">
                      <h3>Property Basics</h3>
                      <p>Tell us about your property</p>
                    </div>
                    <div class="form-grid">
                      <label class="full-span">Property title<input name="title" required maxlength="160"></label>
                      <label>Property category<select name="propertyCategory" required>
                        <option value="">Select category</option>
                        <option value="bedspace">Bedspace</option>
                        <option value="dormitory">Dormitory</option>
                        <option value="boarding_house">Boarding House</option>
                        <option value="room_for_rent">Room for Rent</option>
                        <option value="shared_apartment">Shared Apartment</option>
                        <option value="studio_unit">Studio Unit</option>
                        <option value="condominium">Condominium</option>
                        <option value="apartment">Apartment</option>
                        <option value="townhouse">Townhouse</option>
                        <option value="house">House</option>
                        <option value="duplex">Duplex</option>
                        <option value="loft">Loft</option>
                        <option value="penthouse">Penthouse</option>
                        <option value="staff_house">Staff House</option>
                        <option value="other">Other</option>
                      </select></label>
                      <label>Primary space type<select name="roomType" required>
                        <option value="">Select type</option>
                        <option value="bedspace">Bedspace</option>
                        <option value="private_room">Solo Room</option>
                        <option value="entire_unit">Studio Unit</option>
                        <option value="other">Other</option>
                      </select><input name="customRoomType" type="text" maxlength="100" placeholder="Type your space type" aria-label="Custom space type" hidden></label>
                      <label>Rental arrangement<select name="rentalArrangement" required>
                        <option value="">Select occupancy arrangement</option>
                        <option value="exclusive">Exclusive — one tenant rents the whole space</option>
                        <option value="shared">Shared — rent individual slots within this space</option>
                      </select></label>
                      <label>Monthly price (₱)<input name="monthlyRent" type="text" inputmode="decimal" autocomplete="off" required></label>
                      <label>Rent charged<select name="rentBasis" required>
                        <option value="">Select rent basis</option>
                        <option value="per_space">For the whole space</option>
                        <option value="per_slot">Per occupant or slot</option>
                      </select></label>
                      <label>Maximum occupants<input name="maxOccupants" type="number" min="1" value="1" required></label>
                      <div class="rental-slots-field">
                        <label for="maximum-rentable-slots">Maximum rentable slots</label>
                        <input id="maximum-rentable-slots" name="totalSlots" type="number" min="1" value="1" required>
                        <div id="rental-slot-name-fields" class="rental-slot-name-fields" hidden></div>
                      </div>
                      <label>Security deposit (₱)<input name="securityDeposit" type="number" min="0" step="0.01"></label>
                      <label>Advance payment (months)<input name="advancePaymentMonths" type="number" min="0" max="12" step="1"></label>
                      <label>Furnishing<select name="furnishingStatus" required>
                        <option value="unspecified">Not specified</option>
                        <option value="furnished">Furnished</option>
                        <option value="partially_furnished">Partially furnished</option>
                        <option value="unfurnished">Unfurnished</option>
                      </select></label>
                      <label>Gender preference (for shared spaces)<select name="genderPreference">
                        <option value="">Select preference</option>
                        <option value="co-ed">Co-Ed</option>
                        <option value="male">Male Only</option>
                        <option value="female">Female Only</option>
                      </select></label>
                    </div>
                    <div class="modal-actions">
                      <button type="button" class="btn-secondary modal-close">Cancel</button>
                      <button type="button" class="btn-primary step-next" data-next-step="2">Next: Location</button>
                    </div>
                  </div>

                  <div id="property-form-step-2" class="property-form-step" hidden>
                    <div class="form-step-title">
                      <h3>Location Details</h3>
                      <p>Click or drag the marker to pin your property's exact location on the map.</p>
                    </div>
                    <div class="map-helper-bar">Click or drag the marker to pin your property's exact location on the map.</div>
                    <div class="map-pin-stage" id="map-pin-stage">
                      <div id="property-map" class="property-map" aria-label="Property location map"></div>
                      <button type="button" class="map-current-location" id="use-current-location" aria-label="Return pin to your current location" title="Use my current location"><i class="bi bi-crosshair" aria-hidden="true"></i></button>
                    </div>
                    <div class="location-details-panel">
                      <p class="location-status" id="location-status">Move the pin to detect the address.</p>
                      <p class="location-preview" id="location-preview">Detected address will appear here after selecting the location.</p>
                      <p class="location-coords" id="location-coords"></p>
                    </div>
                    <div class="modal-actions">
                      <button type="button" class="btn-secondary step-back" data-back-step="1">Back</button>
                      <button type="button" class="btn-primary step-next" data-next-step="3" id="location-next" disabled>Next: Amenities</button>
                    </div>
                  </div>

                  <div id="property-form-step-3" class="property-form-step" hidden>
                    <div class="form-step-title">
                      <h3>Amenities &amp; Media</h3>
                      <p>Upload photos for every rentable area, describe the property, and provide house rules.</p>
                    </div>
                    <div class="amenities-section">
                      <label class="section-label">Select available amenities</label>
                      <div class="amenities-grid">
                        <label class="amenity-check"><input type="checkbox" name="amenities" value="wifi"> <span>Wi-Fi</span></label>
                        <label class="amenity-check"><input type="checkbox" name="amenities" value="laundry"> <span>Laundry</span></label>
                        <label class="amenity-check"><input type="checkbox" name="amenities" value="kitchen"> <span>Kitchen</span></label>
                        <label class="amenity-check"><input type="checkbox" name="amenities" value="aircon"> <span>Aircon</span></label>
                        <label class="amenity-check"><input type="checkbox" name="amenities" value="pets_allowed"> <span>Pets allowed</span></label>
                        <label class="amenity-check"><input type="checkbox" name="amenities" value="dishwasher"> <span>Dishwasher</span></label>
                        <label class="amenity-check"><input type="checkbox" name="amenities" value="balcony"> <span>Balcony</span></label>
                        <label class="amenity-check"><input type="checkbox" name="amenities" value="parking"> <span>Parking</span></label>
                        <label class="amenity-check"><input type="checkbox" name="amenities" value="utilities_included"> <span>Utilities included</span></label>
                        <label class="amenity-check"><input type="checkbox" name="amenities" value="cable_ready"> <span>Cable ready</span></label>
                      </div>
                    </div>
                    <div class="ownership-proof-field">
                      <label for="ownership-proof">Proof of ownership or authorization <span aria-hidden="true">*</span></label>
                      <input id="ownership-proof" name="ownershipProof" type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf">
                      <small>Upload a title, tax declaration, or signed owner/manager authorization. JPEG, PNG, WEBP, or PDF up to 5 MB. Admins only can view this private document.</small>
                    </div>
                    <div class="media-dropzone">
                      <input id="property-image" name="images" type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple hidden>
                      <label for="property-image" class="media-dropzone-label">
                        <span class="dropzone-icon" aria-hidden="true">☁</span>
                        <strong>Drag files to upload</strong>
                        <span class="dropzone-or">or</span>
                        <span class="browse-files">Browse Files</span>
                        <span class="dropzone-hint">JPG, PNG, GIF or WEBP up to 2 MB each</span>
                      </label>
                      <div class="media-upload-status" aria-live="polite">Select as many photos as you need</div>
                      <div id="rental-area-photo-fields" class="rental-area-photo-fields" hidden></div>
                    </div>
                    <div class="media-file-list" aria-live="polite"></div>
                    <div class="form-grid">
                      <label class="full-span">Description (optional)<textarea name="description" rows="4" placeholder="Describe the property and what makes it special..."></textarea></label>
                      <label class="full-span">House rules (optional)<textarea name="houseRules" rows="3" placeholder="Add rules that apply to everyone at this property..."></textarea></label>
                    </div>
                    <div class="modal-actions">
                      <button type="button" class="btn-secondary step-back" data-back-step="2">Back</button>
                      <button type="button" class="btn-primary" id="review-listing">Review Listing</button>
                    </div>
                  </div>

                  <div id="property-form-step-4" class="property-form-step" hidden>
                    <div class="form-step-title">
                      <h3>Review Your Listing</h3>
                      <p>Check the information and photos before submitting.</p>
                    </div>
                    <div id="listing-review-summary" class="listing-review-summary"></div>
                    <div class="modal-actions">
                      <button type="button" class="btn-secondary step-back" data-back-step="3">Back to Edit</button>
                      <button type="submit" class="btn-primary">Create Listing</button>
                    </div>
                  </div>
                </form>
                <p id="property-form-message" class="form-message" role="alert" aria-live="assertive" hidden></p>

              </div>
            </div>

            <div id="listing-success-modal" class="listing-success-modal" hidden>
              <div class="listing-success-overlay"></div>
              <div class="listing-success-card" role="dialog" aria-modal="true" aria-labelledby="listing-success-title">
                <div class="listing-success-icon" aria-hidden="true"><span>✓</span></div>
                <h2 id="listing-success-title">Success!</h2>
                <p class="listing-success-message"></p>
                <p class="listing-success-submessage">Your listing is now pending admin approval.</p>
                <button type="button" class="listing-success-ok">OK</button>
              </div>
            </div>

            <section class="portfolio-table-shell">
              <div class="table-wrap">
                <table class="portfolio-table">
                  <thead>
                    <tr>
                      <th>Thumbnail</th>
                      <th>Property Name &amp; Address</th>
                      <th>Amenities</th>
                      <th>Current Rent (PHP)</th>
                      <th>Occupancy Rate</th>
                      <th>Active Inquiries</th>
                      <th>Status</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody id="portfolio-body"></tbody>
                </table>
              </div>
              <nav class="pagination" aria-label="Property listings pagination">
                <button type="button" data-page="prev">Previous</button>
                <span class="pagination-page" aria-live="polite">0 properties</span>
                <button type="button" data-page="next">Next</button>
              </nav>
            </section>

            <div id="property-action-confirm" class="property-action-confirm" hidden>
              <div class="property-action-confirm-overlay"></div>
              <div class="property-action-confirm-card">
                <div class="property-action-confirm-header">
                  <h2 id="property-action-confirm-title">Archive Property</h2>
                </div>
                <div class="property-action-confirm-body">
                  <p id="property-action-confirm-text">Are you sure you want to archive this property?</p>
                </div>
                <div class="property-action-confirm-footer">
                  <button type="button" class="secondary-btn property-action-cancel">Cancel</button>
                  <button type="button" class="primary-btn property-action-confirm-btn">Confirm Archive</button>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>`;

  const portfolioBody = root.querySelector('#portfolio-body');
  const portfolioTable = root.querySelector('.portfolio-table');
  const fitPortfolioTableHeadings = () => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    if (!context) return;
    portfolioTable.querySelectorAll('thead th').forEach((heading) => {
      const baseSize = 12.8;
      const minimumSize = 9;
      const computed = getComputedStyle(heading);
      const availableWidth = heading.clientWidth
        - parseFloat(computed.paddingLeft)
        - parseFloat(computed.paddingRight);
      context.font = `700 ${baseSize}px ${computed.fontFamily}`;
      const words = heading.textContent.trim().toLocaleUpperCase().split(/\s+/);
      const widestWord = Math.max(...words.map((word) => {
        const letterSpacing = parseFloat(computed.letterSpacing) || 0;
        return context.measureText(word).width + Math.max(0, word.length - 1) * letterSpacing;
      }));
      const fontSize = Math.max(minimumSize, Math.min(baseSize, baseSize * availableWidth / widestWord));
      heading.style.fontSize = `${fontSize}px`;
    });
  };
  fitPortfolioTableHeadings();
  if (typeof ResizeObserver !== 'undefined') {
    const headingResizeObserver = new ResizeObserver(fitPortfolioTableHeadings);
    headingResizeObserver.observe(portfolioTable);
  } else {
    window.addEventListener('resize', fitPortfolioTableHeadings);
  }
  const addPropertyButton = root.querySelector('.add-property');
  const propertyModal = root.querySelector('#property-modal');
  const listingSuccessModal = root.querySelector('#listing-success-modal');
  const listingSuccessMessage = root.querySelector('.listing-success-message');
  const listingSuccessSubmessage = root.querySelector('.listing-success-submessage');
  const listingSuccessOkButton = root.querySelector('.listing-success-ok');
  const propertyForm = root.querySelector('#property-form');
  const propertyFormStep1 = root.querySelector('#property-form-step-1');
  const propertyFormStep2 = root.querySelector('#property-form-step-2');
  const propertyFormStep3 = root.querySelector('#property-form-step-3');
  const propertyFormStep4 = root.querySelector('#property-form-step-4');
  const reviewListingButton = root.querySelector('#review-listing');
  const listingReviewSummary = root.querySelector('#listing-review-summary');
  const propertySearchInput = root.querySelector('.property-search input');
  const propertyTypeFilter = root.querySelector('.property-filter select');
  const propertyStatusTabs = root.querySelectorAll('[data-property-status]');
  const formStepIndicator = root.querySelector('#form-step-indicator');
  const propertyFormMessage = root.querySelector('#property-form-message');
  const mediaDropzone = root.querySelector('.media-dropzone');
  const imageInput = root.querySelector('#property-image');
  const uploadStatus = root.querySelector('.media-upload-status');
  const mediaFileList = root.querySelector('.media-file-list');
  const closeButtons = root.querySelectorAll('.modal-close');
  const paginationButtons = root.querySelectorAll('.pagination button[data-page]');
  const mapContainer = root.querySelector('#property-map');
  const mapStage = root.querySelector('#map-pin-stage');
  const locationStatus = root.querySelector('#location-status');
  const locationPreview = root.querySelector('#location-preview');
  const locationCoords = root.querySelector('#location-coords');
  const useCurrentLocationButton = root.querySelector('#use-current-location');
  const locationNextButton = root.querySelector('#location-next');
  const stepNextButtons = root.querySelectorAll('.step-next');
  const stepBackButtons = root.querySelectorAll('.step-back');
  const MAP_ZOOM = 17;
  const MAP_DEFAULT_CENTER = { latitude: 14.5242, longitude: 121.0562 };
  
  // Property cache for reliable data retrieval
  const propertyCache = new Map();
  
  let leafletMap = null;
  let leafletMarker = null;
  let leafletLoadingPromise = null;
  let currentLocationAccuracy = null;
  let activePage = 1;
  let workflowPropertyId = null;
  let workflowTitle = '';
  let workflowPrice = 0;
  let currentFormStep = 1;
  let selectedPhotos = [];
  let photoSelectionChanged = false;
  const monthlyRentInput = propertyForm.elements.monthlyRent;
  const roomTypeSelect = propertyForm.elements.roomType;
  const customRoomTypeInput = propertyForm.elements.customRoomType;
  const rentalArrangementSelect = propertyForm.elements.rentalArrangement;
  const rentBasisSelect = propertyForm.elements.rentBasis;
  const rentalSlotsInput = propertyForm.elements.totalSlots;
  const rentalSlotNameFields = propertyForm.querySelector('#rental-slot-name-fields');
  const rentalAreaPhotoFields = propertyForm.querySelector('#rental-area-photo-fields');
  const ownershipProofInput = propertyForm.elements.ownershipProof;
  let rentalSlotNames = [];
  const defaultRentalSlotName = (index) => {
    let value = index + 1;
    let letters = '';
    while (value > 0) {
      value -= 1;
      letters = String.fromCharCode(65 + (value % 26)) + letters;
      value = Math.floor(value / 26);
    }
    return `Room ${letters}`;
  };
  const rentalSlotCount = () => Math.max(1, Number(rentalSlotsInput.value) || 1);
  const readRentalSlotNames = () => {
    if (rentalSlotNameFields.classList.contains('is-compact')) {
      const names = Array.from({ length: rentalSlotCount() }, (_, index) =>
        rentalSlotNames[index] || defaultRentalSlotName(index));
      const editor = rentalSlotNameFields.querySelector('.rental-slot-name-editor input');
      if (editor) names[Number(editor.dataset.rentalSlotName)] = editor.value.trim();
      return names;
    }
    return Array.from(rentalSlotNameFields.querySelectorAll('[data-rental-slot-name]'))
      .map((input) => input.value.trim());
  };
  const requiresRentalAreaPhotoGrouping = () => {
    return rentalArrangementSelect.value === 'shared';
  };
  const closeRentalSlotEditor = () => {
    rentalSlotNameFields.querySelector('.rental-slot-name-editor')?.remove();
    rentalSlotNameFields.querySelectorAll('.rental-slot-name-box[aria-expanded="true"]')
      .forEach((button) => button.setAttribute('aria-expanded', 'false'));
  };
  const positionRentalSlotEditor = (button, editor) => {
    const rect = button.getBoundingClientRect();
    const editorWidth = Math.min(260, window.innerWidth - 24);
    const hasRoomOnRight = rect.right + 8 + editorWidth <= window.innerWidth - 12;
    const left = hasRoomOnRight
      ? rect.right + 8
      : Math.max(12, rect.left - editorWidth - 8);
    const top = Math.max(12, Math.min(rect.top, window.innerHeight - editor.offsetHeight - 12));
    editor.style.left = `${left}px`;
    editor.style.top = `${top}px`;
  };
  const openRentalSlotEditor = (button) => {
    const index = Number(button.dataset.rentalSlotBox);
    if (!Number.isInteger(index)) return;
    closeRentalSlotEditor();
    button.setAttribute('aria-expanded', 'true');
    const editor = document.createElement('label');
    editor.className = 'rental-slot-name-editor';
    editor.innerHTML = `<span>Rename ${escape(defaultRentalSlotName(index))}</span>
      <input type="text" maxlength="160" data-rental-slot-name="${index}" aria-label="Name for rentable area ${index + 1}" required>`;
    const input = editor.querySelector('input');
    input.value = rentalSlotNames[index] || defaultRentalSlotName(index);
    rentalSlotNameFields.append(editor);
    positionRentalSlotEditor(button, editor);
    input.focus();
    input.select();
  };
  const renderRentalSlotNames = () => {
    const isShared = rentalArrangementSelect.value === 'shared';
    const count = isShared ? rentalSlotCount() : 0;
    const currentNames = readRentalSlotNames();
    const retainedCount = Math.max(count, rentalSlotNames.length);
    rentalSlotNames = Array.from({ length: retainedCount }, (_, index) =>
      currentNames[index] || rentalSlotNames[index] || defaultRentalSlotName(index));
    rentalSlotNameFields.hidden = !isShared;
    rentalSlotNameFields.classList.toggle('is-compact', count >= 10);
    if (!isShared) {
      rentalSlotNameFields.innerHTML = '';
      return;
    }
    rentalSlotNameFields.innerHTML = count >= 10
      ? rentalSlotNames.slice(0, count).map((name, index) => `
        <button type="button" class="rental-slot-name-box" data-rental-slot-box="${index}"
          aria-label="${escape(name)}" aria-expanded="false" title="${escape(name)}">
          ${escape(defaultRentalSlotName(index).replace('Room ', ''))}
        </button>`).join('')
      : rentalSlotNames.slice(0, count).map((name, index) => `
        <label class="rental-slot-name-field">Area ${index + 1} name
          <input type="text" maxlength="160" value="${escape(name)}" data-rental-slot-name="${index}" aria-label="Name for rentable area ${index + 1}" required>
        </label>`).join('');
  };
  const renderRentalAreaPhotoFields = () => {
    const isShared = rentalArrangementSelect.value === 'shared';
    rentalAreaPhotoFields.hidden = !isShared;
    const globalPhotoLabel = propertyForm.querySelector('.media-dropzone-label');
    globalPhotoLabel.hidden = isShared;
    if (!isShared) {
      rentalAreaPhotoFields.innerHTML = '';
      return;
    }
    const names = readRentalSlotNames();
    const areaFields = Array.from({ length: rentalSlotCount() }, (_, index) => {
      const name = names[index] || rentalSlotNames[index] || defaultRentalSlotName(index);
      return `<div class="rental-area-photo-field" data-rental-area-index="${index}">
        <div class="rental-area-photo-heading">
          <strong>${escape(name)}</strong>
        </div>
        <div class="rental-area-photo-thumbnails" aria-label="Photos for ${escape(name)}"></div>
        <div class="rental-area-photo-actions">
          <button type="button" class="rental-area-photo-add">Add photos</button>
          <input type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple data-rental-area-index="${index}" aria-label="Photos for ${escape(name)}" hidden>
        </div>
      </div>`;
    }).join('');
    rentalAreaPhotoFields.innerHTML = `<p class="rental-area-photo-instruction">Add at least one photo per rentable area. JPG, PNG, GIF or WEBP, up to 2 MB each.</p>${areaFields}`;
  };
  const updateRentalAreaPhotoLabels = () => {
    const names = readRentalSlotNames();
    rentalAreaPhotoFields.querySelectorAll('.rental-area-photo-field').forEach((field) => {
      const index = Number(field.dataset.rentalAreaIndex);
      const name = names[index] || rentalSlotNames[index] || defaultRentalSlotName(index);
      field.querySelector('strong').textContent = name;
      field.querySelector('input').setAttribute('aria-label', `Photos for ${name}`);
    });
    renderUploadFiles();
  };
  const syncRentalArrangement = () => {
    const isShared = rentalArrangementSelect.value === 'shared';
    const isSelected = ['exclusive', 'shared'].includes(rentalArrangementSelect.value);
    rentalArrangementSelect.classList.toggle('rental-arrangement-muted', isSelected);
    rentalSlotsInput.disabled = !isShared;
    rentalSlotsInput.required = isShared;
    if (!isShared) rentalSlotsInput.value = '1';
    if (rentalArrangementSelect.value === 'exclusive') rentBasisSelect.value = 'per_space';
    if (rentalArrangementSelect.value === 'shared' && !rentBasisSelect.value) rentBasisSelect.value = 'per_slot';
    renderRentalSlotNames();
    renderRentalAreaPhotoFields();
  };
  rentalArrangementSelect.addEventListener('change', syncRentalArrangement);
  rentalSlotsInput.addEventListener('input', () => {
    renderRentalSlotNames();
    renderRentalAreaPhotoFields();
    renderUploadFiles();
  });
  rentalSlotsInput.addEventListener('change', () => {
    renderRentalAreaPhotoFields();
    renderUploadFiles();
  });
  rentalSlotNameFields.addEventListener('input', (event) => {
    const index = Number(event.target.dataset.rentalSlotName);
    if (Number.isInteger(index)) {
      rentalSlotNames[index] = event.target.value;
      updateRentalAreaPhotoLabels();
      const box = rentalSlotNameFields.querySelector(`[data-rental-slot-box="${index}"]`);
      if (box) {
        box.title = event.target.value || defaultRentalSlotName(index);
        box.setAttribute('aria-label', event.target.value || defaultRentalSlotName(index));
      }
    }
  });
  rentalSlotNameFields.addEventListener('click', (event) => {
    const button = event.target.closest('.rental-slot-name-box');
    if (button) openRentalSlotEditor(button);
  });
  rentalSlotNameFields.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && event.target.matches('.rental-slot-name-editor input')) {
      closeRentalSlotEditor();
      rentalSlotNameFields.querySelector(`[data-rental-slot-box="${event.target.dataset.rentalSlotName}"]`)?.focus();
    } else if (event.key === 'Enter' && event.target.matches('.rental-slot-name-editor input')) {
      event.preventDefault();
      closeRentalSlotEditor();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!rentalSlotNameFields.contains(event.target)) closeRentalSlotEditor();
  });
  window.addEventListener('resize', () => {
    const editor = rentalSlotNameFields.querySelector('.rental-slot-name-editor');
    const button = rentalSlotNameFields.querySelector('.rental-slot-name-box[aria-expanded="true"]');
    if (editor && button) positionRentalSlotEditor(button, editor);
  });
  syncRentalArrangement();
  const isOwnershipProofRequired = () => {
    if (!propertyForm.dataset.editingPropertyId || propertyForm.dataset.hasOwnershipProof !== 'true') return true;
    return [
      [propertyForm.elements.address.value, propertyForm.dataset.originalAddress],
      [propertyForm.elements.municipality.value, propertyForm.dataset.originalMunicipality],
      [propertyForm.elements.barangay.value, propertyForm.dataset.originalBarangay]
    ].some(([current, original]) => String(current ?? '').trim().toLowerCase() !== String(original ?? '').trim().toLowerCase());
  };
  const syncCustomRoomType = () => {
    const isOther = roomTypeSelect.value === 'other';
    customRoomTypeInput.hidden = !isOther;
    customRoomTypeInput.required = isOther;
    if (!isOther) customRoomTypeInput.value = '';
  };

  roomTypeSelect.addEventListener('change', syncCustomRoomType);

  monthlyRentInput.addEventListener('input', () => {
    const rawValue = monthlyRentInput.value;
    const cursor = monthlyRentInput.selectionStart ?? rawValue.length;
    monthlyRentInput.value = formatMonthlyRent(rawValue);
    const nextCursor = formatMonthlyRent(rawValue.slice(0, cursor)).length;
    monthlyRentInput.setSelectionRange(nextCursor, nextCursor);
  });

  const setFormMessage = (message, type = 'error') => {
    propertyFormMessage.hidden = false;
    propertyFormMessage.textContent = message;
    propertyFormMessage.className = `form-message ${type === 'success' ? 'success' : ''}`;
    propertyFormMessage.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  const formatFileSize = (bytes) => bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  const renderMediaFile = (item) => `
    <article class="media-file ${item.error ? 'is-error' : ''}" data-photo-id="${item.id}">
      <img class="media-file-preview" src="${escape(item.previewUrl)}" alt="">
      <div class="media-file-details">
        <div class="media-file-heading"><strong title="${escape(item.file.name)}">${escape(item.file.name)}</strong><span>${formatFileSize(item.file.size)}</span></div>
        ${item.rentalAreaIndex !== null && item.rentalAreaIndex !== undefined && rentalArrangementSelect.value === 'shared'
          ? `<small class="media-file-area">${escape(readRentalSlotNames()[item.rentalAreaIndex] || rentalSlotNames[item.rentalAreaIndex] || defaultRentalSlotName(item.rentalAreaIndex))}</small>`
          : ''}
        <div class="media-progress-row"><div class="media-progress-track"><span style="width: ${item.progress}%"></span></div><strong class="media-progress-percent">${item.progress}%</strong></div>
        <small class="media-file-status"><span class="media-file-status-icon">${item.error ? '!' : item.progress === 100 ? '✓' : '○'}</span>${escape(item.error || (item.progress === 100 ? 'Uploaded successfully' : item.uploading ? 'Uploading...' : 'Ready to upload'))}</small>
      </div>
      ${item.error ? `<button type="button" class="media-file-retry" data-photo-id="${item.id}">Retry</button>` : ''}
      <button type="button" class="media-file-remove" data-photo-id="${item.id}" aria-label="Remove ${escape(item.file.name)}">&times;</button>
    </article>`;

  const renderRentalAreaPhotoThumbnails = () => {
    if (!rentalAreaPhotoFields || rentalArrangementSelect.value !== 'shared') return;
    rentalAreaPhotoFields.querySelectorAll('.rental-area-photo-field').forEach((field) => {
      const index = Number(field.dataset.rentalAreaIndex);
      const thumbnails = field.querySelector('.rental-area-photo-thumbnails');
      const photos = selectedPhotos.filter((photo) => photo.rentalAreaIndex === index);
      const visiblePhotos = photos.slice(0, 3).map((photo, photoIndex) => `
        <div class="rental-area-photo-thumbnail ${photo.error ? 'is-error' : ''}" title="${escape(photo.file.name)}">
          <button type="button" class="rental-area-photo-view" data-photo-id="${photo.id}" aria-label="View ${escape(photo.file.name)}">
            <img src="${escape(photo.previewUrl)}" alt="">
            ${photoIndex === 2 && photos.length > 3 ? `<span class="rental-area-photo-overflow" aria-label="${photos.length - 3} more photos">+${photos.length - 3}</span>` : ''}
          </button>
          ${photo.progress < 100 && !photo.error ? `<span class="rental-area-photo-progress" style="width: ${photo.progress}%"></span>` : ''}
          ${photo.error ? `<button type="button" class="rental-area-photo-retry" data-photo-id="${photo.id}" aria-label="Retry upload of ${escape(photo.file.name)}" title="Retry upload">↻</button>` : ''}
          <button type="button" class="rental-area-photo-remove" data-photo-id="${photo.id}" aria-label="Remove ${escape(photo.file.name)}">&times;</button>
        </div>`).join('');
      thumbnails.innerHTML = visiblePhotos;
    });
  };

  const renderUploadFiles = () => {
    if (!mediaFileList) return;
    const isShared = rentalArrangementSelect.value === 'shared';
    const unassignedPhotos = isShared
      ? selectedPhotos.filter((photo) => photo.rentalAreaIndex === null || photo.rentalAreaIndex === undefined)
      : selectedPhotos;
    mediaFileList.innerHTML = unassignedPhotos.map(renderMediaFile).join('');
    mediaFileList.hidden = isShared && unassignedPhotos.length === 0;
    renderRentalAreaPhotoThumbnails();
    uploadStatus.textContent = selectedPhotos.length === 1 ? '1 photo selected' : `${selectedPhotos.length} photos selected`;
    uploadStatus.classList.toggle('selected', selectedPhotos.length > 0);
  };

  const showRentalAreaPhoto = (photo) => {
    const viewer = document.createElement('dialog');
    viewer.className = 'rental-area-photo-viewer';
    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'rental-area-photo-viewer-close';
    closeButton.setAttribute('aria-label', 'Close photo preview');
    closeButton.textContent = '×';
    const image = document.createElement('img');
    image.src = photo.previewUrl;
    image.alt = photo.file.name;
    closeButton.addEventListener('click', () => viewer.close());
    viewer.addEventListener('click', (event) => {
      if (event.target === viewer) viewer.close();
    });
    viewer.addEventListener('close', () => viewer.remove(), { once: true });
    viewer.append(closeButton, image);
    document.body.append(viewer);
    viewer.showModal();
  };

  const syncInputFiles = () => {
    if (!imageInput || typeof DataTransfer === 'undefined') return;
    const dataTransfer = new DataTransfer();
    selectedPhotos.filter((photo) => !photo.existing).forEach(({ file }) => dataTransfer.items.add(file));
    imageInput.files = dataTransfer.files;
  };

  const addPhotos = (files, rentalAreaIndex = null) => {
    const errors = [];
    Array.from(files || []).forEach((file) => {
      if (!SUPPORTED_PROPERTY_PHOTO_TYPES.includes(file.type)) {
        errors.push(`${file.name}: unsupported file type.`);
        return;
      }
      if (file.size > MAX_PROPERTY_PHOTO_SIZE) {
        errors.push(`${file.name}: file exceeds the 2 MB limit.`);
        return;
      }
      if (selectedPhotos.some((item) => !item.existing
        && item.file.name === file.name
        && item.file.size === file.size
        && item.rentalAreaIndex === rentalAreaIndex)) return;
      const photo = { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, file, previewUrl: URL.createObjectURL(file), progress: 0, error: '', uploading: false, uploadedUrl: '', rentalAreaIndex };
      selectedPhotos.push(photo);
      photoSelectionChanged = true;
      photo.uploadPromise = uploadPhoto(photo);
    });
    syncInputFiles();
    renderUploadFiles();
    if (errors.length) setFormMessage(errors.join(' '));
  };

  const resetPhotos = () => {
    selectedPhotos.filter((photo) => !photo.existing).forEach(({ previewUrl }) => URL.revokeObjectURL(previewUrl));
    selectedPhotos = [];
    photoSelectionChanged = false;
    if (imageInput) imageInput.value = '';
    renderUploadFiles();
  };

  if (imageInput) {
    imageInput.addEventListener('change', (event) => addPhotos(event.target.files, 0));
  }
  rentalAreaPhotoFields.addEventListener('change', (event) => {
    const input = event.target.closest('input[data-rental-area-index]');
    if (input) {
      addPhotos(input.files, Number(input.dataset.rentalAreaIndex));
      input.value = '';
    }
  });
  rentalAreaPhotoFields.addEventListener('click', (event) => {
    const viewButton = event.target.closest('.rental-area-photo-view');
    if (viewButton) {
      const photo = selectedPhotos.find((item) => item.id === viewButton.dataset.photoId);
      if (photo) showRentalAreaPhoto(photo);
      return;
    }
    const retryButton = event.target.closest('.rental-area-photo-retry');
    if (retryButton) {
      const photo = selectedPhotos.find((item) => item.id === retryButton.dataset.photoId);
      if (photo) photo.uploadPromise = uploadPhoto(photo);
      return;
    }
    const removeButton = event.target.closest('.rental-area-photo-remove');
    if (removeButton) {
      const photo = selectedPhotos.find((item) => item.id === removeButton.dataset.photoId);
      if (photo) photoSelectionChanged = true;
      if (photo && !photo.existing) URL.revokeObjectURL(photo.previewUrl);
      selectedPhotos = selectedPhotos.filter((item) => item.id !== removeButton.dataset.photoId);
      syncInputFiles();
      renderUploadFiles();
      return;
    }
    const addButton = event.target.closest('.rental-area-photo-add');
    if (addButton) addButton.parentElement.querySelector('input[type="file"]').click();
  });

  if (mediaDropzone) {
    ['dragenter', 'dragover'].forEach((eventName) => {
      mediaDropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        mediaDropzone.classList.add('dragover');
      });
    });
    ['dragleave', 'dragend'].forEach((eventName) => {
      mediaDropzone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        mediaDropzone.classList.remove('dragover');
      });
    });
    mediaDropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      event.stopPropagation();
      mediaDropzone.classList.remove('dragover');
      const files = event.dataTransfer?.files;
      if (files?.length) {
        const area = event.target.closest('[data-rental-area-index]');
        if (rentalArrangementSelect.value === 'shared' && !area) {
          setFormMessage('Drop photos onto the matching rentable area, or use its upload field.');
          return;
        }
        addPhotos(files, area ? Number(area.dataset.rentalAreaIndex) : 0);
      }
    });
  }

  mediaFileList?.addEventListener('click', (event) => {
    const retryButton = event.target.closest('.media-file-retry');
    if (retryButton) {
      const photo = selectedPhotos.find((item) => item.id === retryButton.dataset.photoId);
      if (photo) photo.uploadPromise = uploadPhoto(photo);
      return;
    }
    const button = event.target.closest('.media-file-remove');
    if (!button) return;
    const photo = selectedPhotos.find((item) => item.id === button.dataset.photoId);
    if (photo) photoSelectionChanged = true;
    if (photo && !photo.existing) URL.revokeObjectURL(photo.previewUrl);
    selectedPhotos = selectedPhotos.filter((item) => item.id !== button.dataset.photoId);
    syncInputFiles();
    renderUploadFiles();
  });

  renderUploadFiles();
  rentalArrangementSelect.addEventListener('change', renderUploadFiles);

  const updateStepIndicator = (step) => {
    const stepMarkers = formStepIndicator.querySelectorAll('.step-marker');
    stepMarkers.forEach((marker) => {
      const markerStep = Number(marker.dataset.step);
      marker.classList.toggle('active', markerStep === step);
      marker.classList.toggle('completed', markerStep < step);
    });
  };

  const showFormStep = (step) => {
    currentFormStep = step;
    propertyFormStep1.hidden = step !== 1;
    propertyFormStep2.hidden = step !== 2;
    propertyFormStep3.hidden = step !== 3;
    propertyFormStep4.hidden = step !== 4;
    updateStepIndicator(step);
    propertyFormMessage.hidden = true;
    if (step === 2) {
      initializeMapStep();
    }
  };

  const validateStep = (step) => {
    if (step === 1) {
      const title = propertyForm.elements.title.value.trim();
      const propertyCategory = propertyForm.elements.propertyCategory.value;
      const roomType = propertyForm.elements.roomType.value;
      const rentalArrangement = rentalArrangementSelect.value;
      const monthlyRent = Number(propertyForm.elements.monthlyRent.value.replace(/,/g, ''));
      const totalSlots = propertyForm.elements.totalSlots.value;
      const maxOccupants = Number(propertyForm.elements.maxOccupants.value);
      const rentBasis = rentBasisSelect.value;
      const genderPreference = propertyForm.elements.genderPreference.value;
      
      if (!title) {
        setFormMessage('Please enter a property title.');
        return false;
      }
      if (!propertyCategory) {
        setFormMessage('Please select a property category.');
        return false;
      }
      if (!roomType) {
        setFormMessage('Please select the primary rentable space type.');
        return false;
      }
      if (roomType === 'other' && !customRoomTypeInput.value.trim()) {
        setFormMessage('Please enter your space type.');
        customRoomTypeInput.focus();
        return false;
      }
      if (!['exclusive', 'shared'].includes(rentalArrangement)) {
        setFormMessage('Please specify whether this space is rented exclusively or shared.');
        return false;
      }
      if (!Number.isFinite(monthlyRent) || monthlyRent < 1) {
        setFormMessage('Please enter a valid monthly price.');
        return false;
      }
      if (rentalArrangement === 'shared' && (!totalSlots || !Number.isInteger(Number(totalSlots)) || Number(totalSlots) < 1)) {
        setFormMessage('Please enter a valid number of rental slots.');
        return false;
      }
      if (rentalArrangement === 'shared') {
        const names = readRentalSlotNames();
        const normalizedNames = names.map((name) => name.toLowerCase());
        if (names.length !== Number(totalSlots) || names.some((name) => !name) || new Set(normalizedNames).size !== names.length) {
          setFormMessage('Give every rentable area a unique name before continuing.');
          return false;
        }
      }
      if (!Number.isInteger(maxOccupants) || maxOccupants < 1) {
        setFormMessage('Please enter a valid maximum occupant count.');
        return false;
      }
      if (!rentBasis || (rentalArrangement === 'exclusive' && rentBasis !== 'per_space')) {
        setFormMessage('Choose how rent is charged. Exclusive spaces are charged per space.');
        return false;
      }
      if (rentalArrangement === 'shared' && !genderPreference) {
        setFormMessage('Please select a gender preference for this shared space.');
        return false;
      }
      return true;
    }
    if (step === 2) {
      const address = propertyForm.elements.address.value.trim();
      const municipality = propertyForm.elements.municipality.value.trim();
      const latitude = propertyForm.elements.latitude.value;
      const longitude = propertyForm.elements.longitude.value;
      if (!address || !municipality || !latitude || !longitude) {
        setFormMessage('Please pin the property location on the map to detect the address.');
        return false;
      }
      return true;
    }
    if (step === 3) {
      const proofRequired = isOwnershipProofRequired();
      ownershipProofInput.required = proofRequired;
      const ownershipProof = ownershipProofInput.files[0];
      if (proofRequired && !ownershipProof) {
        setFormMessage('Upload proof of ownership or authorization before submitting this listing.');
        ownershipProofInput.focus();
        return false;
      }
      if (ownershipProof && ownershipProof.size > 5 * 1024 * 1024) {
        setFormMessage('Ownership proof must be no larger than 5 MB.');
        ownershipProofInput.focus();
        return false;
      }
      const imageField = propertyForm.elements.images;
      const isEditing = !!propertyForm.dataset.editingPropertyId;
      // Only require image when creating new property, not when editing
      if (!isEditing && !imageField?.files?.length) {
        if (!selectedPhotos.length) {
          setFormMessage('Please upload a property image.');
          return false;
        }
      }
      if (requiresRentalAreaPhotoGrouping()) {
        const names = readRentalSlotNames();
        if (selectedPhotos.some((photo) => photo.rentalAreaIndex >= names.length)) {
          setFormMessage('Remove photos assigned to rentable areas that are no longer included.');
          return false;
        }
        const missingArea = names.findIndex((_, index) =>
          !selectedPhotos.some((photo) => photo.rentalAreaIndex === index)
        );
        if (missingArea !== -1) {
          setFormMessage(`Upload at least one photo for ${names[missingArea]}.`);
          return false;
        }
      }
      return true;
    }
    return true;
  };

  const renderListingReview = () => {
    const roomType = roomTypeSelect.value === 'other'
      ? customRoomTypeInput.value.trim()
      : normalizePropertyTypeLabel(roomTypeSelect.value);
    const propertyCategory = propertyForm.elements.propertyCategory.selectedOptions[0]?.textContent || 'Not specified';
    const amenities = Array.from(propertyForm.querySelectorAll('input[name="amenities"]:checked'))
      .map((checkbox) => formatAmenityLabel(checkbox.value));
    const photos = selectedPhotos.map((photo) => photo.previewUrl).filter(Boolean);
    const rentalAreas = requiresRentalAreaPhotoGrouping()
      ? readRentalSlotNames().map((name, index) => ({
        name,
        photos: selectedPhotos.filter((photo) => photo.rentalAreaIndex === index).map((photo) => photo.previewUrl)
      }))
      : [];
    const values = [
      ['Property category', propertyCategory],
      ['Primary space type', roomType],
      ['Rental arrangement', rentalArrangementSelect.selectedOptions[0]?.textContent || 'Not specified'],
      ['Monthly price', `PHP ${propertyForm.elements.monthlyRent.value || '0'} ${rentBasisSelect.value === 'per_slot' ? 'per slot / month' : '/ month'}`],
      ['Maximum occupants', propertyForm.elements.maxOccupants.value],
      ['Maximum rentable slots', rentalArrangementSelect.value === 'shared' ? propertyForm.elements.totalSlots.value : '1 (exclusive space)'],
      ['Gender preference', propertyForm.elements.genderPreference.selectedOptions[0]?.textContent || 'Not specified'],
      ['Location', [propertyForm.elements.address.value, propertyForm.elements.barangay.value, propertyForm.elements.municipality.value].filter(Boolean).join(', ')],
      ['Ownership proof', ownershipProofInput.files[0]?.name || (propertyForm.dataset.hasOwnershipProof === 'true' ? 'Existing proof on file (private)' : 'Missing')],
      ['Amenities', amenities.join(', ') || 'None selected'],
      ['Description', propertyForm.elements.description.value.trim() || 'No description provided'],
      ['House rules', propertyForm.elements.houseRules.value.trim() || 'No additional rules']
    ];

    listingReviewSummary.innerHTML = `
      <dl class="listing-review-facts">${values.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${escape(value)}</dd></div>`).join('')}</dl>
      ${rentalAreas.length ? `<section class="listing-review-gallery" aria-label="Rentable area photos">
        ${rentalAreas.map((area) => `<div class="listing-review-area"><h4>${escape(area.name)} <span>${area.photos.length} photos</span></h4>
          ${area.photos.length ? `<div class="listing-review-photos">${area.photos.map((photo, index) => `<img src="${escape(photo)}" alt="${escape(area.name)} photo ${index + 1}" />`).join('')}</div>` : '<p>No photos selected.</p>'}
        </div>`).join('')}
      </section>` : ''}
      ${rentalAreas.length ? '' : `<section class="listing-review-gallery" aria-label="Listing photos">
        <h4>Photos <span>${photos.length}</span></h4>
        ${photos.length ? `<div class="listing-review-photos">${photos.map((photo, index) => `<img src="${escape(photo)}" alt="Listing photo ${index + 1}" />`).join('')}</div>` : '<p>No photos selected.</p>'}
      </section>`}`;
  };

  const closeModal = () => {
    propertyModal.hidden = true;
    propertyForm.reset();
    rentalSlotNames = [];
    syncRentalArrangement();
    propertyForm.elements.address.value = '';
    propertyForm.elements.municipality.value = '';
    propertyForm.elements.barangay.value = '';
    propertyForm.elements.latitude.value = '';
    propertyForm.elements.longitude.value = '';
    currentLocationAccuracy = null;
    syncCustomRoomType();
    resetPhotos();
    showFormStep(1);
    propertyFormMessage.hidden = true;
    propertyFormMessage.className = 'form-message';
    workflowPropertyId = null;
    workflowTitle = '';
    workflowPrice = 0;
    currentFormStep = 1;
    locationStatus.textContent = 'Move the pin to detect the address.';
    locationPreview.textContent = 'Detected address will appear here after selecting the location.';
    locationCoords.textContent = '';
    locationNextButton.disabled = true;
    // Reset editing state
    propertyForm.removeAttribute('data-editing-property-id');
    delete propertyForm.dataset.hasOwnershipProof;
    delete propertyForm.dataset.originalAddress;
    delete propertyForm.dataset.originalMunicipality;
    delete propertyForm.dataset.originalBarangay;
    ownershipProofInput.required = true;
    const modalHeader = propertyModal.querySelector('.property-modal-header h2');
    const submitBtn = propertyForm.querySelector('button[type="submit"]');
    modalHeader.textContent = 'Create a listing';
    submitBtn.textContent = 'Create Listing';
    reviewListingButton.textContent = 'Review Listing';
  };

  const loadLeafletAssets = () => {
    if (leafletLoadingPromise) return leafletLoadingPromise;
    leafletLoadingPromise = new Promise((resolve, reject) => {
      if (window.L && window.L.map) {
        resolve();
        return;
      }

      const cssLink = document.createElement('link');
      cssLink.rel = 'stylesheet';
      cssLink.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.append(cssLink);

      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Unable to load Leaflet assets.'));
      document.body.append(script);
    });
    return leafletLoadingPromise;
  };

  const getCurrentUserCoordinates = () => new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ latitude: coords.latitude, longitude: coords.longitude, accuracy: coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 }
    );
  });

  const initializeLeafletMap = async () => {
    if (!mapContainer) return;
    await loadLeafletAssets();
    const latitudeValue = propertyForm.elements.latitude.value.trim();
    const longitudeValue = propertyForm.elements.longitude.value.trim();
    const storedLatitude = Number(latitudeValue);
    const storedLongitude = Number(longitudeValue);
    const hasStoredCoordinates = latitudeValue !== '' && longitudeValue !== '' && Number.isFinite(storedLatitude) && Number.isFinite(storedLongitude);
    let initialCoordinates = hasStoredCoordinates ? { latitude: storedLatitude, longitude: storedLongitude } : null;

    if (!hasStoredCoordinates && !propertyForm.dataset.editingPropertyId) {
      locationStatus.textContent = 'Finding your current location...';
      initialCoordinates = await getCurrentUserCoordinates();
    }
    const hasInitialLocation = Boolean(initialCoordinates);
    currentLocationAccuracy = initialCoordinates?.accuracy ?? null;
    const mapCoordinates = initialCoordinates || MAP_DEFAULT_CENTER;
    const initialCenter = [mapCoordinates.latitude, mapCoordinates.longitude];

    if (!leafletMap) {
      leafletMap = L.map(mapContainer, {
        center: initialCenter,
        zoom: MAP_ZOOM,
        scrollWheelZoom: true,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19,
      }).addTo(leafletMap);

      leafletMarker = L.marker(initialCenter, {
        draggable: true,
      }).addTo(leafletMap);

      leafletMarker.on('dragend', () => {
        currentLocationAccuracy = null;
        syncLocationFromMarker();
      });
      leafletMap.on('click', (event) => {
        leafletMarker.setLatLng(event.latlng);
        currentLocationAccuracy = null;
        syncLocationFromMarker();
      });
    } else {
      leafletMap.setView(initialCenter, MAP_ZOOM);
      leafletMarker.setLatLng(initialCenter);
    }

    setTimeout(() => leafletMap?.invalidateSize(), 150);
    return hasInitialLocation;
  };

  const initializeMapStep = async () => {
    if (!mapContainer || !mapStage) return;
    locationStatus.textContent = 'Move the pin to detect the address.';
    locationPreview.textContent = 'Detected address will appear here after selecting the location.';
    locationCoords.textContent = '';
    locationNextButton.disabled = true;

    try {
      const hasInitialLocation = await initializeLeafletMap();
      if (hasInitialLocation) {
        syncLocationFromMarker();
      } else {
        locationStatus.textContent = 'Could not access your current location.';
        locationPreview.textContent = 'Allow location access and retry, or move the pin to your property.';
      }
    } catch (error) {
      locationStatus.textContent = 'Unable to load the map. Please try again later.';
      setFormMessage('Could not initialize the location map.');
    }
  };

  const pinCoordinates = () => {
    if (leafletMarker && leafletMarker.getLatLng) {
      const { lat, lng } = leafletMarker.getLatLng();
      return { latitude: lat, longitude: lng };
    }
    return { latitude: MAP_DEFAULT_CENTER.latitude, longitude: MAP_DEFAULT_CENTER.longitude };
  };

  const updateLocationFields = (address = '', municipality = '', barangay = '', latitude = '', longitude = '') => {
    propertyForm.elements.address.value = address;
    propertyForm.elements.municipality.value = municipality;
    propertyForm.elements.barangay.value = barangay;
    propertyForm.elements.latitude.value = latitude;
    propertyForm.elements.longitude.value = longitude;
  };

  const setLocationPreview = ({ displayName, addressLine, municipality, barangay, latitude, longitude }) => {
    locationStatus.textContent = Number.isFinite(currentLocationAccuracy)
      ? `Current location found (about ${Math.max(1, Math.round(currentLocationAccuracy))} m accuracy).`
      : 'Location detected successfully.';
    locationPreview.textContent = displayName || addressLine || 'Address detected.';
    locationCoords.textContent = latitude && longitude ? `Latitude: ${latitude.toFixed(6)}, Longitude: ${longitude.toFixed(6)}` : '';
    locationNextButton.disabled = !addressLine || !municipality || !latitude || !longitude;
  };

  const reverseGeocode = async (latitude, longitude) => {
    try {
      const response = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}`);
      if (!response.ok) throw new Error('Reverse geocoding failed.');
      const data = await response.json();
      const address = data.address ?? {};
      const addressLine = [address.road, address.house_number, address.neighbourhood, address.suburb].filter(Boolean).join(' ') || data.display_name || '';
      const municipality = address.city || address.town || address.village || address.county || address.state || '';
      const barangay = address.suburb || address.quarter || address.hamlet || '';
      const displayName = [addressLine, municipality, barangay].filter(Boolean).join(', ');
      updateLocationFields(addressLine, municipality, barangay, latitude.toFixed(8), longitude.toFixed(8));
      setLocationPreview({ displayName, addressLine, municipality, barangay, latitude, longitude });
    } catch (error) {
      locationStatus.textContent = 'Unable to detect address. Move the pin again.';
      locationPreview.textContent = 'Move the marker to refresh the detected address.';
      locationCoords.textContent = '';
      locationNextButton.disabled = true;
    }
  };

  const syncLocationFromMarker = () => {
    const { latitude, longitude } = pinCoordinates();
    reverseGeocode(latitude, longitude);
  };

  useCurrentLocationButton?.addEventListener('click', async () => {
    useCurrentLocationButton.disabled = true;
    locationStatus.textContent = 'Finding your current location...';
    locationPreview.textContent = 'Waiting for your device location.';
    const coordinates = await getCurrentUserCoordinates();
    if (!coordinates) {
      currentLocationAccuracy = null;
      locationStatus.textContent = 'Could not access your current location.';
      locationPreview.textContent = 'Allow location access and retry, or move the pin to your property.';
      locationNextButton.disabled = true;
      useCurrentLocationButton.disabled = false;
      return;
    }
    currentLocationAccuracy = coordinates.accuracy;
    const point = [coordinates.latitude, coordinates.longitude];
    leafletMap?.setView(point, MAP_ZOOM);
    leafletMarker?.setLatLng(point);
    syncLocationFromMarker();
    useCurrentLocationButton.disabled = false;
  });

  addPropertyButton?.addEventListener('click', () => {
    propertyModal.hidden = false;
    showFormStep(1);
  });
  if (requestedAction === 'create') addPropertyButton?.click();
  closeButtons.forEach((button) => button.addEventListener('click', closeModal));
  listingSuccessOkButton?.addEventListener('click', () => {
    listingSuccessModal.hidden = true;
    document.body.classList.remove('listing-success-modal-open');
    load();
  });

  stepNextButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const nextStep = Number(button.dataset.nextStep);
      if (validateStep(currentFormStep)) {
        showFormStep(nextStep);
      }
    });
  });

  stepBackButtons.forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const backStep = Number(button.dataset.backStep);
      showFormStep(backStep);
    });
  });

  reviewListingButton?.addEventListener('click', () => {
    if (!validateStep(3)) return;
    renderListingReview();
    showFormStep(4);
  });

  // Leaflet map interaction is handled internally by the map library.

  const ITEMS_PER_PAGE = 5;

  const getPagedProperties = (items = []) => {
    const totalPages = Math.max(1, Math.ceil(items.length / ITEMS_PER_PAGE));
    activePage = Math.min(Math.max(1, activePage), totalPages);
    const startIndex = (activePage - 1) * ITEMS_PER_PAGE;
    return items.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  };

  paginationButtons.forEach((button) => {
    button.addEventListener('click', () => {
      const page = button.dataset.page;
      const totalPages = Math.max(1, Math.ceil(getFilteredPropertyRows().length / ITEMS_PER_PAGE));
      if (page === 'prev') {
        activePage = Math.max(1, activePage - 1);
      } else if (page === 'next') {
        activePage = Math.min(totalPages, activePage + 1);
      } else {
        activePage = Number(page);
      }
      activePage = Math.min(Math.max(1, activePage), totalPages);
      applyPropertyTableState();
    });
  });

  const uploadPhoto = (photo) => new Promise((resolve, reject) => {
    photo.uploading = true;
    photo.error = '';
    photo.progress = 0;
    renderUploadFiles();
    const request = new XMLHttpRequest();
    request.open('POST', `${API}/properties/uploads`);
    request.timeout = 120000;
    Object.entries(authHeaders()).forEach(([key, value]) => request.setRequestHeader(key, value));
    request.upload.addEventListener('progress', (event) => {
      if (!event.lengthComputable) return;
      photo.progress = Math.round((event.loaded / event.total) * 100);
      renderUploadFiles();
    });
    request.addEventListener('load', () => {
      let body = {};
      try { body = JSON.parse(request.responseText || '{}'); } catch {}
      if (request.status >= 200 && request.status < 300) {
        photo.progress = 100;
        photo.uploading = false;
        photo.uploadedUrl = body.data?.imageUrl ?? '';
        renderUploadFiles();
        resolve(body);
      } else {
        console.error('[property upload] server rejected file', {
          file: photo.file.name,
          status: request.status,
          response: request.responseText
        });
        photo.uploading = false;
        photo.error = `Upload failed (${request.status || 'no response'})`;
        renderUploadFiles();
        reject(Object.assign(new Error(body.message ?? 'Upload failed'), { status: request.status, body }));
      }
    });
    request.addEventListener('error', () => {
      console.error('[property upload] network error', { file: photo.file.name, url: request.responseURL, status: request.status });
      photo.uploading = false;
      photo.error = 'Upload failed (network error)';
      renderUploadFiles();
      reject(new Error('Upload failed'));
    });
    request.addEventListener('timeout', () => {
      console.error('[property upload] timeout', { file: photo.file.name, url: request.responseURL });
      photo.uploading = false;
      photo.error = 'Upload failed (timeout)';
      renderUploadFiles();
      reject(new Error('Upload failed'));
    });
    const formData = new FormData();
    formData.append('image', photo.file);
    request.send(formData);
  });

  propertyForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (currentFormStep !== 4 || !validateStep(3)) return;
    const formData = new FormData(propertyForm);
    formData.set('monthlyRent', String(formData.get('monthlyRent') ?? '').replace(/,/g, ''));
    if (formData.get('roomType') === 'other') {
      formData.set('roomType', customRoomTypeInput.value.trim());
    }
    formData.delete('customRoomType');
    const editingPropertyId = propertyForm.dataset.editingPropertyId;
    const isEditing = !!editingPropertyId;
    
    try {
      const url = isEditing ? `${API}/properties/${editingPropertyId}` : `${API}/properties`;
      const method = isEditing ? 'PUT' : 'POST';
      
      formData.delete('images');
      formData.delete('image');
      const ownershipProofFile = ownershipProofInput.files[0];
      if (ownershipProofFile) formData.set('ownershipProof', ownershipProofFile);
      else formData.delete('ownershipProof');
      const newPhotos = selectedPhotos.filter((photo) => !photo.existing);
      const uploadResults = await Promise.allSettled(newPhotos.map((photo) => photo.uploadPromise));
      if (uploadResults.some((result) => result.status === 'rejected' || !result.value?.data?.imageUrl)) {
        setFormMessage('Some photos failed to upload. Retry them individually before closing this form.');
        return;
      }
      const photoUrls = selectedPhotos.map((photo) => photo.uploadedUrl).filter(Boolean);
      if (photoUrls.length || photoSelectionChanged) {
        formData.append('imageUrl', photoUrls[0] ?? '');
        formData.append('images', JSON.stringify(photoUrls));
      }
      if (requiresRentalAreaPhotoGrouping()) {
        const rentalAreas = readRentalSlotNames().map((name, index) => ({
          name,
          images: selectedPhotos
            .filter((photo) => photo.rentalAreaIndex === index)
            .map((photo) => photo.uploadedUrl)
            .filter(Boolean)
        }));
        formData.set('rentalAreas', JSON.stringify(rentalAreas));
      } else if (isEditing && rentalArrangementSelect.value !== 'shared') {
        formData.set('rentalAreas', JSON.stringify([]));
      }
      const finalResponse = await fetch(url, { method, headers: authHeaders(), body: formData });
      let responseBody = {};
      try { responseBody = await finalResponse.json(); } catch {}
      if (!finalResponse.ok) {
        throw Object.assign(new Error(responseBody.message || 'Unable to save property.'), {
          status: finalResponse.status,
          body: responseBody
        });
      }
      listingSuccessMessage.textContent = isEditing ? 'Property updated successfully!' : 'Property created successfully!';
      listingSuccessSubmessage.textContent = isEditing
        ? 'Changes are now pending admin approval.'
        : 'Your listing is now pending admin approval.';
      closeModal();
      listingSuccessModal.hidden = false;
      document.body.classList.add('listing-success-modal-open');
      listingSuccessOkButton.focus();
    } catch (error) {
      if (error.status === 401) {
        clearSession();
        setFormMessage('Your session has expired. Please sign in again.', 'error');
        setTimeout(() => location.assign('#/login'), 800);
        return;
      }
      setFormMessage(error.message);
    }
  });


  let propertyRows = [];
  let allPropertyRows = [];
  let allBookingRows = [];
  let pendingPropertyAction = null;

  const normalizePropertyTypeValue = (value = '') => {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw || raw === 'property type') return '';
    const aliasMap = {
      'bedspace': 'bedspace',
      'solo room': 'private_room',
      'private_room': 'private_room',
      'private room': 'private_room',
      'studio unit': 'entire_unit',
      'entire_unit': 'entire_unit',
      'entire unit': 'entire_unit'
    };
    return aliasMap[raw] ?? raw.replace(/\s+/g, '_');
  };

  const getFilteredPropertyRows = () => {
    const searchValue = (propertySearchInput?.value ?? '').trim().toLowerCase();
    const selectedCategory = String(propertyTypeFilter?.value ?? '').trim().toLowerCase();

    return allPropertyRows.filter((item) => {
      const isArchived = item.status === 'archived';
      const propertyCategory = String(item.property_category || 'other').trim().toLowerCase();
      const searchableText = [
        item.title,
        item.address,
        item.municipality,
        item.barangay,
        item.property_category_name,
        item.space_name,
        item.room_type,
        item.property_type,
        propertyCategory
      ].join(' ').toLowerCase();

      const matchesSearch = !searchValue || searchableText.includes(searchValue);
      const matchesType = !selectedCategory || propertyCategory === selectedCategory;
      const matchesStatus = propertyStatus === 'archived' ? isArchived : !isArchived;
      return matchesSearch && matchesType && matchesStatus;
    });
  };

  const applyPropertyTableState = () => {
    const filteredRows = getFilteredPropertyRows();
    const pagedRows = getPagedProperties(filteredRows);
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / ITEMS_PER_PAGE));
    root.querySelector('.pagination-page').textContent = String(activePage);
    paginationButtons.forEach((button) => {
      button.disabled = button.dataset.page === 'prev'
        ? activePage <= 1
        : activePage >= totalPages || filteredRows.length === 0;
    });
    renderRows(pagedRows);
  };

  const propertyActionConfirm = root.querySelector('#property-action-confirm');
  const propertyActionConfirmTitle = root.querySelector('#property-action-confirm-title');
  const propertyActionConfirmText = root.querySelector('#property-action-confirm-text');
  const propertyActionConfirmCancelBtn = root.querySelector('.property-action-cancel');
  const propertyActionConfirmActionBtn = root.querySelector('.property-action-confirm-btn');

  const closePropertyActionConfirm = () => {
    pendingPropertyAction = null;
    propertyActionConfirm.hidden = true;
  };

  const openPropertyActionConfirm = (property, action) => {
    pendingPropertyAction = { property, action };
    const isRestore = action === 'restore';
    propertyActionConfirmTitle.textContent = isRestore ? 'Restore Property' : 'Archive Property';
    propertyActionConfirmText.textContent = isRestore
      ? `Restore ${property.title || 'this property'} to your active listings?`
      : `Are you sure you want to archive ${property.title || 'this property'}?`;
    propertyActionConfirmActionBtn.textContent = isRestore ? 'Confirm Restore' : 'Confirm Archive';
    propertyActionConfirmActionBtn.dataset.action = action;
    propertyActionConfirm.hidden = false;
  };

  const renderRows = (items = []) => {
    propertyRows = items;
    propertyCache.clear();
    const rows = items.map((item) => {
      const occupancy = getOccupancySummary(item, allBookingRows);
      const inquiryCount = getPropertyInquiryCount(item.id, allBookingRows);
      const image = normalizePropertyImage(item);
      propertyCache.set(String(item.id), item);
      const titleText = escape(item.title || 'Untitled Property');
      const propertyTypeLabel = normalizePropertyTypeLabel(item.room_type || item.property_type || '');
      const statusKey = String(item.approval_status || item.status || 'pending').toLowerCase().replace(/[^a-z0-9_-]/g, '');
      const statusLabel = statusKey.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
      return `
        <tr>
          <td>${image ? `<img class="property-thumb" data-property-id="${escape(String(item.id ?? ''))}" src="${escape(image)}" alt="${escape(item.title || 'Property photo')}" />` : '<div class="thumb-placeholder"></div>'}</td>
          <td>
            <strong>${titleText}</strong><br />
            <small><i class="bi bi-geo-alt-fill property-address-icon" aria-hidden="true"></i> ${escape([item.address, item.municipality, item.barangay].filter(Boolean).join(', ') || 'No address provided')}</small>
          </td>
          <td>${renderAmenitiesChips(item) || '<span class="empty-amenity">None</span>'}</td>
          <td data-label="Current Rent (PHP)">₱${Number(item.monthly_rent ?? 0).toLocaleString()}/mo</td>
          <td data-label="Occupancy Rate">
            <div class="occupancy-cell">
              <div class="progress-track"><span data-rate="${occupancy.rate}"></span></div>
              <small>${escape(occupancy.label)}</small>
            </div>
          </td>
          <td data-label="Active Inquiries"><span class="inquiry-count"><i class="bi bi-chat-dots" aria-hidden="true"></i>${inquiryCount} ${inquiryCount === 1 ? 'inquiry' : 'inquiries'}</span></td>
          <td data-label="Status"><span class="property-approval-status is-${statusKey}">${escape(statusLabel)}</span></td>
          <td>
            <div class="property-row-actions">
              <div class="property-inline-actions">
                <a href="#/owner/inquiries?propertyId=${escape(String(item.id ?? ''))}" class="manage-link" data-property-id="${escape(String(item.id ?? ''))}">Manage</a>
              </div>
              <div class="property-more-wrap">
                <button type="button" class="property-more-btn" data-property-id="${escape(String(item.id ?? ''))}" aria-label="More property actions">⋯</button>
                <div class="property-menu" hidden>
                  ${item.status !== 'archived' ? `<button type="button" class="property-menu-action edit-property" data-property-id="${escape(String(item.id ?? ''))}">Edit</button>` : ''}
                  <button type="button" class="property-menu-action view-property" data-property-id="${escape(String(item.id ?? ''))}">View</button>
                  ${item.status === 'archived'
                    ? `<button type="button" class="property-menu-action" data-property-id="${escape(String(item.id ?? ''))}" data-action="restore">Restore</button>`
                    : `<button type="button" class="property-menu-action" data-property-id="${escape(String(item.id ?? ''))}" data-action="archive">Archive</button>`}
                </div>
              </div>
            </div>
          </td>
        </tr>`;
    });
    portfolioBody.innerHTML = rows.join('') || `<tr><td colspan="8" class="empty-row">${propertyStatus === 'archived' ? 'No archived properties yet.' : 'No active listings yet.'}</td></tr>`;
    portfolioBody.querySelectorAll('.progress-track span').forEach((bar) => {
      bar.style.setProperty('--rate', `${bar.dataset.rate}%`);
    });
  };

  portfolioBody.addEventListener('click', (event) => {
    const propertyThumb = event.target.closest('.property-thumb');
    if (propertyThumb) {
      const property = propertyCache.get(propertyThumb.dataset.propertyId);
      if (property) showPropertyPhotoViewer(property);
      return;
    }
    const menuButton = event.target.closest('.property-more-btn');
    if (menuButton) {
      event.stopPropagation();
      const menu = menuButton.parentElement.querySelector('.property-menu');
      const shouldOpen = menu.hidden;

      portfolioBody.querySelectorAll('.property-menu').forEach((item) => {
        if (item !== menu) {
          item.hidden = true;
          item.classList.remove('is-upward');
        }
      });

      if (shouldOpen) {
        const rect = menuButton.getBoundingClientRect();
        menu.hidden = false;
        const menuHeight = menu.offsetHeight || 170;
        const menuWidth = menu.offsetWidth || 140;
        const spaceBelow = window.innerHeight - rect.bottom;
        const spaceAbove = rect.top;
        const shouldOpenUpward = spaceBelow < menuHeight && spaceAbove > menuHeight;
        menu.classList.toggle('is-upward', shouldOpenUpward);
        const top = shouldOpenUpward
          ? Math.max(8, rect.top - menuHeight - 8)
          : Math.min(window.innerHeight - menuHeight - 8, rect.bottom + 8);
        const left = Math.max(8, Math.min(window.innerWidth - menuWidth - 8, rect.right - menuWidth));
        menu.style.top = `${top}px`;
        menu.style.left = `${left}px`;
      } else {
        menu.hidden = true;
        menu.classList.remove('is-upward');
        menu.style.removeProperty('top');
        menu.style.removeProperty('left');
      }
      return;
    }

    const menuAction = event.target.closest('.property-menu-action');
    if (menuAction) {
      const menu = menuAction.closest('.property-menu');
      if (menu) {
        menu.hidden = true;
        menu.classList.remove('is-upward');
        menu.style.removeProperty('top');
        menu.style.removeProperty('left');
      }
    }

    const editBtn = event.target.closest('.edit-property');
    const viewBtn = event.target.closest('.view-property');

    if (menuAction && menuAction.dataset.action) {
      const propertyId = String(menuAction.dataset.propertyId);
      const property = propertyRows.find((item) => String(item.id) === propertyId);
      if (property) {
        openPropertyActionConfirm(property, menuAction.dataset.action);
      }
      return;
    }

    if (editBtn) {
      event.preventDefault();
      try {
        const propertyId = String(editBtn.dataset.propertyId);
        const propertyData = propertyCache.get(propertyId);
        if (!propertyData) {
          console.error('Property not found in cache:', propertyId);
          setFormMessage('Unable to find property data. Please try again.');
          return;
        }
        loadPropertyForEdit(propertyData);
      } catch (error) {
        console.error('Error loading property for edit:', error);
        setFormMessage('Unable to load property for editing.');
      }
      return;
    }

    if (viewBtn) {
      event.preventDefault();
      try {
        const propertyId = String(viewBtn.dataset.propertyId);
        const propertyData = propertyCache.get(propertyId);
        if (!propertyData) {
          console.error('Property not found in cache:', propertyId);
          setFormMessage('Unable to find property data. Please try again.');
          return;
        }
        showPropertyDetails(propertyData);
      } catch (error) {
        console.error('Error loading property details:', error);
        setFormMessage('Unable to load property details.');
      }
    }
  });

  propertyActionConfirmCancelBtn.addEventListener('click', closePropertyActionConfirm);
  propertyActionConfirmActionBtn.addEventListener('click', async () => {
    if (!pendingPropertyAction) return;

    const { property, action } = pendingPropertyAction;
    const propertyId = String(property.id);

    try {
      if (action === 'archive') {
        const response = await fetch(`${API}/properties/${propertyId}`, {
          method: 'PATCH',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'archived' })
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(body.message || 'Unable to archive property.');
        }
        if (body.data?.status !== 'archived') {
          throw new Error('The server did not mark this property as archived. Please try again.');
        }
        setPropertyStatus('archived');
      } else if (action === 'restore') {
        const response = await fetch(`${API}/properties/${propertyId}/restore`, {
          method: 'PATCH',
          headers: authHeaders()
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.message || 'Unable to restore property.');
        }
        setPropertyStatus('active');
      }

      closePropertyActionConfirm();
      if (action === 'archive' || action === 'restore') {
        await successDialog(action === 'archive' ? 'Property archived successfully.' : 'Property restored successfully.');
      }
      await load();
      await updateListingCountsInSidebar();
    } catch (error) {
      console.error('Property action failed:', error);
      setFormMessage(error.message || 'Unable to complete this action.');
      closePropertyActionConfirm();
    }
  });

  propertySearchInput?.addEventListener('input', () => {
    activePage = 1;
    applyPropertyTableState();
  });

  propertyTypeFilter?.addEventListener('change', () => {
    activePage = 1;
    applyPropertyTableState();
  });

  let propertyStatus = 'active';
  const setPropertyStatus = (status) => {
    propertyStatus = status;
    activePage = 1;
    propertyStatusTabs.forEach((tab) => {
      const selected = tab.dataset.propertyStatus === status;
      tab.classList.toggle('active', selected);
      tab.setAttribute('aria-pressed', String(selected));
    });
    applyPropertyTableState();
  };

  propertyStatusTabs.forEach((button) => button.addEventListener('click', () => {
    setPropertyStatus(button.dataset.propertyStatus);
  }));

  document.addEventListener('click', (event) => {
    if (!event.target.closest('.property-more-btn') && !event.target.closest('.property-menu')) {
      portfolioBody.querySelectorAll('.property-menu').forEach((menu) => {
        menu.hidden = true;
      });
    }
  });

  const loadPropertyForEdit = (propertyData) => {
    resetPhotos();
    let existingImages = propertyData.images;
    if (typeof existingImages === 'string') {
      try { existingImages = JSON.parse(existingImages); } catch { existingImages = []; }
    }
    let existingRentalAreas = propertyData.rental_areas;
    if (typeof existingRentalAreas === 'string') {
      try { existingRentalAreas = JSON.parse(existingRentalAreas); } catch { existingRentalAreas = []; }
    }
    existingRentalAreas = Array.isArray(existingRentalAreas) ? existingRentalAreas : [];
    rentalSlotNames = existingRentalAreas.map((area) => String(area.name || '').trim());
    const rentalAreaByImage = new Map();
    existingRentalAreas.forEach((area, index) => {
      (Array.isArray(area.images) ? area.images : []).forEach((url) => {
        if (!rentalAreaByImage.has(url)) rentalAreaByImage.set(url, index);
      });
    });
    const existingPhotoUrls = [...new Set([
      propertyData.image_url,
      ...(Array.isArray(existingImages) ? existingImages : [])
    ].filter((image) => typeof image === 'string' && image.trim()))];
    selectedPhotos = existingPhotoUrls.map((url, index) => ({
      id: `existing-${propertyData.id}-${index}`,
      file: { name: url.split('/').pop() || 'Property photo', size: 0 },
      previewUrl: resolveImageUrl(url),
      uploadedUrl: url,
      progress: 100,
      error: '',
      uploading: false,
      existing: true,
      rentalAreaIndex: rentalAreaByImage.get(url) ?? null
    }));
    renderUploadFiles();

    // Populate the form with existing property data
    const form = propertyForm;
    form.elements.title.value = propertyData.title || '';
    form.elements.propertyCategory.value = propertyData.property_category || 'other';
    const savedRoomType = String(propertyData.room_type || propertyData.property_type || '').trim();
    const normalizedRoomType = normalizePropertyTypeValue(savedRoomType);
    const standardRoomTypes = ['bedspace', 'private_room', 'entire_unit'];
    if (standardRoomTypes.includes(normalizedRoomType)) {
      form.elements.roomType.value = normalizedRoomType;
      customRoomTypeInput.value = '';
    } else if (savedRoomType) {
      form.elements.roomType.value = 'other';
      customRoomTypeInput.value = savedRoomType;
    } else {
      form.elements.roomType.value = '';
      customRoomTypeInput.value = '';
    }
    syncCustomRoomType();
    form.elements.monthlyRent.value = formatMonthlyRent(propertyData.monthly_rent || '');
    form.elements.rentalArrangement.value = propertyData.rental_arrangement || (normalizedRoomType === 'bedspace' ? 'shared' : 'exclusive');
    form.elements.rentBasis.value = propertyData.rent_basis || (form.elements.rentalArrangement.value === 'shared' ? 'per_slot' : 'per_space');
    form.elements.maxOccupants.value = propertyData.space_max_occupants || propertyData.max_occupants || '1';
    form.elements.totalSlots.value = propertyData.space_capacity_slots || propertyData.total_slots || '1';
    form.elements.securityDeposit.value = propertyData.security_deposit ?? '';
    form.elements.advancePaymentMonths.value = propertyData.advance_payment_months ?? '';
    form.elements.furnishingStatus.value = propertyData.furnishing_status || 'unspecified';
    syncRentalArrangement();
    renderUploadFiles();
    form.elements.genderPreference.value = propertyData.gender_preference || '';
    form.elements.address.value = propertyData.address || '';
    form.elements.municipality.value = propertyData.municipality || '';
    form.elements.barangay.value = propertyData.barangay || '';
    form.elements.latitude.value = propertyData.latitude || '';
    form.elements.longitude.value = propertyData.longitude || '';
    form.elements.description.value = propertyData.description || '';
    form.elements.houseRules.value = propertyData.house_rules || '';
    form.dataset.hasOwnershipProof = String(propertyData.has_ownership_proof === true || Number(propertyData.has_ownership_proof) === 1);
    form.dataset.originalAddress = propertyData.address || '';
    form.dataset.originalMunicipality = propertyData.municipality || '';
    form.dataset.originalBarangay = propertyData.barangay || '';
    ownershipProofInput.required = form.dataset.hasOwnershipProof !== 'true';
    
    // Set amenities
    const amenitiesCheckboxes = form.querySelectorAll('input[name="amenities"]');
    const propertyAmenities = normalizeAmenities(propertyData);
    amenitiesCheckboxes.forEach((checkbox) => {
      checkbox.checked = propertyAmenities.includes(checkbox.value.toLowerCase());
    });
    
    // Update modal title and button text for edit mode
    const modalHeader = propertyModal.querySelector('.property-modal-header h2');
    const submitBtn = form.querySelector('button[type="submit"]');
    modalHeader.textContent = 'Edit Property Listing';
    submitBtn.textContent = 'Update Listing';
    reviewListingButton.textContent = 'Review Changes';
    form.dataset.editingPropertyId = propertyData.id;
    
    // Show modal and start from step 1
    propertyModal.hidden = false;
    showFormStep(1);
  };

  const showRentalSpaceManager = (propertyData) => {
    const manager = document.createElement('div');
    manager.className = 'property-details-modal rental-space-manager';
    manager.innerHTML = `
      <section class="property-details-card" role="dialog" aria-modal="true" aria-labelledby="rental-space-manager-title">
        <header class="property-details-header">
          <div><h2 id="rental-space-manager-title">Manage rental spaces</h2><p>${escape(propertyData.title || 'Property')}</p></div>
          <button type="button" class="modal-close" aria-label="Close rental space manager">×</button>
        </header>
        <div class="rental-space-manager-content">
          <p class="rental-space-manager-status" role="status" aria-live="polite"></p>
          <div class="rental-space-manager-list" aria-label="Rental spaces"></div>
          <form class="rental-space-manager-form">
            <h3 data-space-form-heading>Add a rental space</h3>
            <div class="rental-space-form-grid">
              <label>Space name<input name="name" maxlength="160" required placeholder="e.g. Room 101"></label>
              <label>Space type<input name="spaceType" maxlength="100" required placeholder="e.g. Bedspace"></label>
              <label>Rental arrangement<select name="rentalArrangement" required>
                <option value="exclusive">Exclusive</option><option value="shared">Shared</option>
              </select></label>
              <label>Rent basis<select name="rentBasis" required>
                <option value="per_space">Per space</option><option value="per_slot">Per occupant or slot</option>
              </select></label>
              <label>Monthly rent (₱)<input name="monthlyRent" type="number" min="0.01" step="0.01" required></label>
              <label>Maximum occupants<input name="maxOccupants" type="number" min="1" step="1" value="1" required></label>
              <label>Maximum rentable slots<input name="capacitySlots" type="number" min="1" step="1" value="1" required></label>
              <label>Security deposit (₱)<input name="securityDeposit" type="number" min="0" step="0.01"></label>
              <label>Advance payment (months)<input name="advancePaymentMonths" type="number" min="0" max="12" step="1"></label>
              <label>Furnishing<select name="furnishingStatus" required>
                <option value="unspecified">Not specified</option><option value="furnished">Furnished</option>
                <option value="partially_furnished">Partially furnished</option><option value="unfurnished">Unfurnished</option>
              </select></label>
              <label>Gender preference<select name="genderPreference">
                <option value="">Not specified</option><option value="co-ed">Co-Ed</option>
                <option value="male">Male only</option><option value="female">Female only</option>
              </select></label>
              <label>Available from<input name="availableFrom" type="date"></label>
              <label class="rental-space-form-wide">Amenities (comma-separated)<input name="amenities" maxlength="500" placeholder="Wi-Fi, furnished, parking"></label>
              <label class="rental-space-form-wide">Space description<textarea name="description" rows="2"></textarea></label>
              <label class="rental-space-manager-enabled"><input name="isEnabled" type="checkbox" checked> Space is enabled for listing</label>
            </div>
            <div class="rental-space-manager-actions">
              <button type="button" class="btn-secondary rental-space-form-cancel" hidden>Cancel edit</button>
              <button type="submit" class="btn-primary">Add space</button>
            </div>
          </form>
        </div>
      </section>`;
    document.body.append(manager);

    const status = manager.querySelector('.rental-space-manager-status');
    const list = manager.querySelector('.rental-space-manager-list');
    const form = manager.querySelector('.rental-space-manager-form');
    const arrangement = form.elements.rentalArrangement;
    const slots = form.elements.capacitySlots;
    const rentBasis = form.elements.rentBasis;
    const submit = form.querySelector('button[type="submit"]');
    const cancelEdit = manager.querySelector('.rental-space-form-cancel');
    const syncSpaceArrangement = () => {
      const shared = arrangement.value === 'shared';
      slots.disabled = !shared;
      slots.required = shared;
      if (!shared) slots.value = '1';
      rentBasis.value = shared ? 'per_slot' : 'per_space';
    };
    arrangement.addEventListener('change', syncSpaceArrangement);

    const resetSpaceForm = () => {
      form.reset();
      form.dataset.editingSpaceId = '';
      form.querySelector('[data-space-form-heading]').textContent = 'Add a rental space';
      submit.textContent = 'Add space';
      cancelEdit.hidden = true;
      syncSpaceArrangement();
    };
    const loadSpaces = async () => {
      status.textContent = 'Loading spaces...';
      const response = await fetch(`${API}/properties/${encodeURIComponent(propertyData.id)}/spaces`, {
        headers: authHeaders()
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.message || 'Unable to load rental spaces.');
      const spaces = Array.isArray(body.data) ? body.data : [];
      status.textContent = spaces.length
        ? `${spaces.length} rental ${spaces.length === 1 ? 'space' : 'spaces'}`
        : 'No rental spaces have been added.';
      list.innerHTML = spaces.map((space) => `
        <article class="rental-space-manager-item">
          <div>
            <strong>${escape(space.name)}</strong>
            <span>${escape(space.space_type)} · ${space.rental_arrangement === 'shared' ? 'Shared' : 'Exclusive'} · PHP ${Number(space.monthly_rent).toLocaleString('en-PH')} ${space.rent_basis === 'per_slot' ? 'per slot' : 'per space'} / month</span>
            <small>${Number(space.capacity_slots)} rentable slot${Number(space.capacity_slots) === 1 ? '' : 's'} · Up to ${Number(space.max_occupants)} occupant${Number(space.max_occupants) === 1 ? '' : 's'}${Number(space.is_enabled) ? '' : ' · Disabled'}${Number(space.is_default) ? ' · Primary space' : ''}</small>
          </div>
          <div class="rental-space-manager-item-actions">
            <button type="button" class="btn-secondary" data-edit-space="${escape(space.id)}">Edit</button>
            ${Number(space.is_default) ? '' : `<button type="button" class="btn-secondary" data-delete-space="${escape(space.id)}">Delete</button>`}
          </div>
        </article>`).join('');
      list.querySelectorAll('[data-edit-space]').forEach((button) => {
        button.addEventListener('click', () => {
          const space = spaces.find((item) => String(item.id) === button.dataset.editSpace);
          if (!space) return;
          form.elements.name.value = space.name || '';
          form.elements.spaceType.value = space.space_type || '';
          form.elements.rentalArrangement.value = space.rental_arrangement || 'exclusive';
          form.elements.rentBasis.value = space.rent_basis || 'per_space';
          form.elements.monthlyRent.value = space.monthly_rent ?? '';
          form.elements.maxOccupants.value = space.max_occupants || 1;
          form.elements.capacitySlots.value = space.capacity_slots || 1;
          form.elements.securityDeposit.value = space.security_deposit ?? '';
          form.elements.advancePaymentMonths.value = space.advance_payment_months ?? '';
          form.elements.furnishingStatus.value = space.furnishing_status || 'unspecified';
          form.elements.genderPreference.value = space.gender_preference || '';
          form.elements.availableFrom.value = space.available_from ? String(space.available_from).slice(0, 10) : '';
          form.elements.amenities.value = (Array.isArray(space.amenities)
            ? space.amenities
            : typeof space.amenities === 'string'
              ? (() => { try { return JSON.parse(space.amenities); } catch { return []; } })()
              : []).join(', ');
          form.elements.description.value = space.description || '';
          form.elements.isEnabled.checked = Boolean(Number(space.is_enabled));
          form.dataset.editingSpaceId = space.id;
          form.querySelector('[data-space-form-heading]').textContent = `Edit ${space.name}`;
          submit.textContent = 'Save changes';
          cancelEdit.hidden = false;
          syncSpaceArrangement();
          form.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
      list.querySelectorAll('[data-delete-space]').forEach((button) => {
        button.addEventListener('click', async () => {
          const space = spaces.find((item) => String(item.id) === button.dataset.deleteSpace);
          if (!space || !window.confirm(`Delete "${space.name}"?`)) return;
          try {
            const response = await fetch(`${API}/properties/${encodeURIComponent(propertyData.id)}/spaces/${encodeURIComponent(space.id)}`, {
              method: 'DELETE', headers: authHeaders()
            });
            const body = response.status === 204 ? {} : await response.json();
            if (!response.ok) throw new Error(body.message || 'Unable to delete rental space.');
            resetSpaceForm();
            await loadSpaces();
            status.textContent = 'Rental space deleted. The property is pending review.';
          } catch (error) {
            status.textContent = error.message;
          }
        });
      });
    };

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const isEditing = Boolean(form.dataset.editingSpaceId);
      const amenities = form.elements.amenities.value.split(',').map((item) => item.trim()).filter(Boolean);
      const payload = {
        name: form.elements.name.value.trim(),
        spaceType: form.elements.spaceType.value.trim(),
        description: form.elements.description.value.trim() || null,
        rentalArrangement: arrangement.value,
        rentBasis: rentBasis.value,
        monthlyRent: Number(form.elements.monthlyRent.value),
        maxOccupants: Number(form.elements.maxOccupants.value),
        capacitySlots: arrangement.value === 'shared' ? Number(slots.value) : 1,
        securityDeposit: form.elements.securityDeposit.value === '' ? null : Number(form.elements.securityDeposit.value),
        advancePaymentMonths: form.elements.advancePaymentMonths.value === '' ? null : Number(form.elements.advancePaymentMonths.value),
        furnishingStatus: form.elements.furnishingStatus.value,
        genderPreference: form.elements.genderPreference.value || null,
        availableFrom: form.elements.availableFrom.value || null,
        amenities,
        isEnabled: form.elements.isEnabled.checked
      };
      const spaceId = form.dataset.editingSpaceId;
      try {
        const response = await fetch(`${API}/properties/${encodeURIComponent(propertyData.id)}/spaces${isEditing ? `/${encodeURIComponent(spaceId)}` : ''}`, {
          method: isEditing ? 'PUT' : 'POST',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        const body = response.status === 204 ? {} : await response.json();
        if (!response.ok) throw new Error(body.message || 'Unable to save rental space.');
        resetSpaceForm();
        await loadSpaces();
        status.textContent = `Rental space ${isEditing ? 'updated' : 'added'}. The property is pending review.`;
      } catch (error) {
        status.textContent = error.message;
      }
    });

    cancelEdit.addEventListener('click', resetSpaceForm);
    manager.querySelector('.modal-close').addEventListener('click', () => manager.remove());
    manager.addEventListener('click', (event) => {
      if (event.target === manager) manager.remove();
    });
    loadSpaces().catch((error) => { status.textContent = error.message; });
  };

  const showPropertyDetails = (propertyData) => {
    const galleryImages = normalizePropertyImages(propertyData);
    const photos = galleryImages.length ? galleryImages : [DEFAULT_IMAGE_PLACEHOLDER];
    const availableSlots = Math.max(0, Number(propertyData.available_slots ?? propertyData.total_slots ?? 0));
    const owner = user();
    const ownerName = propertyData.owner_name
      || propertyData.owner?.name
      || [propertyData.owner?.first_name, propertyData.owner?.last_name].filter(Boolean).join(' ')
      || [owner.first_name, owner.last_name].filter(Boolean).join(' ')
      || owner.name
      || 'N/A';
    const detailsModal = document.createElement('div');
    detailsModal.className = 'property-details-modal';
    detailsModal.innerHTML = `
      <div class="property-details-card">
        <div class="property-details-header">
          <h2><span class="property-details-header-icon"><i class="bi bi-house-door-fill" aria-hidden="true"></i></span>Property Details</h2>
          <button type="button" class="modal-close" aria-label="Close property details">×</button>
        </div>
        <div class="property-details-content">
          <div class="property-details-gallery" aria-label="Property photos">
            <div class="property-details-gallery-stage">
              <img class="property-details-main-image" src="${escape(photos[0])}" alt="${escape(propertyData.title || 'Property')} photo 1">
              <span class="property-details-image-counter" aria-live="polite">1 / ${photos.length}</span>
              <button type="button" class="property-details-gallery-nav previous" aria-label="Previous photo">&#8249;</button>
              <button type="button" class="property-details-gallery-nav next" aria-label="Next photo">&#8250;</button>
            </div>
            <div class="property-details-thumbnails" role="group" aria-label="Property photo thumbnails">
              ${photos.map((image, index) => `<button type="button" class="property-details-thumbnail${index === 0 ? ' active' : ''}" data-gallery-index="${index}" aria-label="View photo ${index + 1}" aria-current="${index === 0 ? 'true' : 'false'}"><img src="${escape(image)}" alt=""></button>`).join('')}
          </div>
          </div>
          <div class="property-details-information">
            <div class="property-details-heading">
              <h3>${escape(propertyData.title || 'Property')}</h3>
              <strong>PHP ${Number(propertyData.monthly_rent ?? 0).toLocaleString('en-PH')} / month</strong>
            </div>
            <div class="property-details-facts">
              <div class="details-section"><span class="details-label"><i class="bi bi-geo-alt-fill" aria-hidden="true"></i>Location</span><p>${escape([propertyData.address, propertyData.barangay, propertyData.municipality].filter(Boolean).join(', ') || 'No address')}</p></div>
              <div class="details-section"><span class="details-label"><i class="bi bi-house-fill" aria-hidden="true"></i>Property category</span><p>${escape(propertyData.property_category_name || normalizePropertyTypeLabel(propertyData.room_type || propertyData.property_type || 'N/A')) || 'N/A'}</p></div>
              <div class="details-section"><span class="details-label"><i class="bi bi-door-open-fill" aria-hidden="true"></i>Primary space</span><p>${escape(propertyData.space_name || propertyData.title || 'Rental space')} · ${escape(propertyData.rental_arrangement === 'shared' ? 'Shared' : 'Exclusive')}</p></div>
              <div class="details-section"><span class="details-label"><i class="bi bi-door-open-fill" aria-hidden="true"></i>Availability</span><p>${propertyData.total_slots != null ? (availableSlots > 0 ? `${availableSlots} slot${availableSlots === 1 ? '' : 's'} available` : 'No slots available') : 'N/A'}</p></div>
              <div class="details-section"><span class="details-label"><i class="bi bi-gender-ambiguous" aria-hidden="true"></i>Gender Preference</span><p>${escape(String(propertyData.gender_preference || 'Any').replaceAll('_', ' '))}</p></div>
              <div class="details-section"><span class="details-label"><i class="bi bi-person-fill" aria-hidden="true"></i>Owner</span><p>${escape(ownerName)}</p></div>
              <div class="details-section details-amenities"><span class="details-label"><i class="bi bi-stars" aria-hidden="true"></i>Amenities</span><div class="amenities-list">${renderAmenitiesChips(propertyData) || '<span>None</span>'}</div></div>
            </div>
            <div class="details-section property-details-description">
              <span class="details-label"><i class="bi bi-card-text" aria-hidden="true"></i>Description</span>
              <p>${escape(propertyData.description || 'No description provided')}</p>
            </div>
            ${propertyData.house_rules ? `<div class="details-section property-details-description"><span class="details-label"><i class="bi bi-list-check" aria-hidden="true"></i>House rules</span><p>${escape(propertyData.house_rules)}</p></div>` : ''}
          </div>
        </div>
        <div class="property-details-actions">
          <button type="button" class="btn-primary manage-rental-spaces">Manage rental spaces</button>
          <button type="button" class="btn-secondary close-details">Close</button>
        </div>
      </div>
    `;
    
    document.body.append(detailsModal);
    
    // Handle close button
    detailsModal.querySelector('.modal-close').addEventListener('click', () => detailsModal.remove());
    detailsModal.querySelector('.close-details').addEventListener('click', () => detailsModal.remove());
    detailsModal.querySelector('.manage-rental-spaces').addEventListener('click', () => showRentalSpaceManager(propertyData));

    const mainImage = detailsModal.querySelector('.property-details-main-image');
    const counter = detailsModal.querySelector('.property-details-image-counter');
    const thumbnails = Array.from(detailsModal.querySelectorAll('.property-details-thumbnail'));
    let photoIndex = 0;
    const showPhoto = (nextIndex) => {
      photoIndex = (nextIndex + photos.length) % photos.length;
      mainImage.src = photos[photoIndex];
      mainImage.alt = `${propertyData.title || 'Property'} photo ${photoIndex + 1}`;
      counter.textContent = `${photoIndex + 1} / ${photos.length}`;
      thumbnails.forEach((thumbnail, index) => {
        const active = index === photoIndex;
        thumbnail.classList.toggle('active', active);
        thumbnail.setAttribute('aria-current', String(active));
      });
    };
    detailsModal.querySelector('.property-details-gallery-nav.previous').addEventListener('click', () => showPhoto(photoIndex - 1));
    detailsModal.querySelector('.property-details-gallery-nav.next').addEventListener('click', () => showPhoto(photoIndex + 1));
    thumbnails.forEach((thumbnail) => thumbnail.addEventListener('click', () => showPhoto(Number(thumbnail.dataset.galleryIndex))));
    mainImage.addEventListener('click', () => showPropertyPhotoViewer(propertyData));
    
    // Close on backdrop click
    detailsModal.addEventListener('click', (event) => {
      if (event.target === detailsModal) detailsModal.remove();
    });
  };

  const load = async () => {
    try {
      try {
        const categoryResponse = await fetch(`${API}/properties/categories`);
        const categoryBody = await categoryResponse.json();
        if (!categoryResponse.ok) throw new Error(categoryBody.message ?? 'Unable to load property categories.');
        const categorySelect = propertyForm.elements.propertyCategory;
        const categoryFilter = propertyTypeFilter;
        for (const category of categoryBody.data ?? []) {
          if (!Array.from(categorySelect.options).some((option) => option.value === category.slug)) {
            categorySelect.add(new Option(category.name, category.slug));
          }
          if (!Array.from(categoryFilter.options).some((option) => option.value === category.slug)) {
            categoryFilter.add(new Option(category.name, category.slug));
          }
        }
      } catch (error) {
        setFormMessage(`Property categories could not be refreshed: ${error.message}`);
      }

      let propertiesResponse;
      let bookingsResponse;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        propertiesResponse = await fetch(`${API}/properties?limit=100`, { headers: authHeaders() });
        if (propertiesResponse.status !== 429 || attempt === 1) break;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      for (let attempt = 0; attempt < 2; attempt += 1) {
        bookingsResponse = await fetch(`${API}/bookings`, { headers: authHeaders() });
        if (bookingsResponse.status !== 429 || attempt === 1) break;
        await new Promise((resolve) => setTimeout(resolve, 800));
      }

      const propertiesBody = await propertiesResponse.json();
      const bookingsBody = await bookingsResponse.json();

      if (!propertiesResponse.ok) {
        if (propertiesResponse.status === 401) {
          clearSession();
          portfolioBody.innerHTML = '<tr><td colspan="7" class="empty-row">Your session has expired. Please sign in again.</td></tr>';
          setTimeout(() => location.assign('#/login'), 800);
          return;
        }
        throw new Error(propertiesBody.message ?? 'Unable to load listings.');
      }

      if (!bookingsResponse.ok) {
        if (bookingsResponse.status === 401) {
          clearSession();
          portfolioBody.innerHTML = '<tr><td colspan="7" class="empty-row">Your session has expired. Please sign in again.</td></tr>';
          setTimeout(() => location.assign('#/login'), 800);
          return;
        }
        throw new Error(bookingsBody.message ?? 'Unable to load inquiries.');
      }

      const items = (propertiesBody.data ?? []).filter((item) => Number(item.owner_id) === Number(user().id));
      allPropertyRows = items;
      allBookingRows = Array.isArray(bookingsBody.data) ? bookingsBody.data : [];
      applyPropertyTableState();
      if (requestedPropertyId && requestedAction === 'edit') {
        const requestedProperty = allPropertyRows.find((item) => String(item.id) === String(requestedPropertyId));
        if (requestedProperty) loadPropertyForEdit(requestedProperty);
      }
      await updateListingCountsInSidebar();
    } catch (error) {
      portfolioBody.innerHTML = `<tr><td colspan="7" class="empty-row">${escape(error.message)}</td></tr>`;
    }
  };

  load();
}
