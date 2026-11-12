import * as categories from '../models/PropertyCategory.js';
import * as properties from '../models/Property.js';
import * as rentalSpaces from '../models/RentalSpace.js';

const arrangements = new Set(['exclusive', 'shared']);
const furnishingStatuses = new Set(['furnished', 'partially_furnished', 'unfurnished', 'unspecified']);
const ownerAvailabilityStatuses = new Set(['available', 'unavailable', 'coming_soon']);

const validationError = (message) => {
  const error = new Error(message);
  error.statusCode = 422;
  error.expose = true;
  return error;
};

function parseAmenities(value) {
  if (value === undefined || value === null || value === '') return null;
  let amenities = value;
  if (typeof amenities === 'string') {
    try { amenities = JSON.parse(amenities); } catch { amenities = amenities.split(','); }
  }
  if (!Array.isArray(amenities) || amenities.some((item) => typeof item !== 'string')) {
    throw validationError('Amenities must be a list of text values.');
  }
  return JSON.stringify([...new Set(amenities.map((item) => item.trim()).filter(Boolean))]);
}

function positiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw validationError(`${label} must be a whole number greater than zero.`);
  return number;
}

function nonnegativeMoney(value, label, { required = false } = {}) {
  if (!required && (value === undefined || value === null || value === '')) return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || (required && number === 0)) {
    throw validationError(`${label} must be ${required ? 'greater than zero' : 'zero or greater'}.`);
  }
  return number;
}

export function normalizeRentalSpaceInput(input, existing = null) {
  const value = (camel, snake, fallback = null) => input[camel] ?? input[snake] ?? existing?.[snake] ?? fallback;
  const name = String(input.name ?? input.spaceName ?? existing?.name ?? '').trim();
  const spaceType = String(value('spaceType', 'space_type', '')).trim();
  const rentalArrangement = String(value('rentalArrangement', 'rental_arrangement', 'exclusive')).toLowerCase();
  const furnishingStatus = String(value('furnishingStatus', 'furnishing_status', 'unspecified')).toLowerCase();
  const availabilityProvided = input.availabilityStatus !== undefined || input.availability_status !== undefined;
  const availabilityStatus = String(value('availabilityStatus', 'availability_status', 'available')).toLowerCase();
  if (!name || name.length > 160) throw validationError('Space name is required and must be 160 characters or fewer.');
  if (!spaceType || spaceType.length > 100) throw validationError('Space type is required and must be 100 characters or fewer.');
  if (!arrangements.has(rentalArrangement)) throw validationError('Rental arrangement must be exclusive or shared.');
  if (!furnishingStatuses.has(furnishingStatus)) throw validationError('Choose a supported furnishing status.');
  if (availabilityProvided && !ownerAvailabilityStatuses.has(availabilityStatus)) {
    throw validationError('Availability must be available, unavailable, or coming soon.');
  }

  const maxOccupants = positiveInteger(value('maxOccupants', 'max_occupants', 1), 'Maximum occupants');
  const requestedSlots = positiveInteger(
    input.capacitySlots ?? input.maxSlots ?? input.capacity_slots ?? existing?.capacity_slots ?? 1,
    'Maximum rentable slots'
  );
  const capacitySlots = rentalArrangement === 'exclusive' ? 1 : requestedSlots;
  const monthlyRent = nonnegativeMoney(value('monthlyRent', 'monthly_rent'), 'Monthly rent', { required: true });
  const rentBasis = String(value('rentBasis', 'rent_basis', rentalArrangement === 'shared' ? 'per_slot' : 'per_space')).toLowerCase();
  if (!['per_space', 'per_slot'].includes(rentBasis)) throw validationError('Rent basis must be per space or per slot.');
  if (rentalArrangement === 'exclusive' && rentBasis !== 'per_space') {
    throw validationError('Exclusive spaces must use a per-space rent.');
  }

  const securityDeposit = nonnegativeMoney(value('securityDeposit', 'security_deposit'), 'Security deposit');
  const advancePaymentMonths = value('advancePaymentMonths', 'advance_payment_months');
  const normalizedAdvanceMonths = advancePaymentMonths === null || advancePaymentMonths === ''
    ? null
    : Number(advancePaymentMonths);
  if (normalizedAdvanceMonths !== null && (!Number.isInteger(normalizedAdvanceMonths) || normalizedAdvanceMonths < 0 || normalizedAdvanceMonths > 12)) {
    throw validationError('Advance payment must be a whole number from 0 to 12 months.');
  }
  const genderPreference = value('genderPreference', 'gender_preference');
  if (genderPreference !== null && !['co-ed', 'male', 'female'].includes(genderPreference)) {
    throw validationError('Gender preference must be co-ed, male, or female.');
  }
  const availableFrom = value('availableFrom', 'available_from');
  if (availableFrom && !/^\d{4}-\d{2}-\d{2}$/.test(String(availableFrom))) {
    throw validationError('Provide a valid available-from date.');
  }
  const isEnabledValue = value('isEnabled', 'is_enabled', true);
  const isEnabled = ![false, 0, '0', 'false'].includes(isEnabledValue);
  const amenities = input.amenities !== undefined ? parseAmenities(input.amenities) : existing?.amenities ?? null;
  return {
    name,
    spaceType,
    description: value('description', 'description', null),
    rentalArrangement,
    maxOccupants,
    capacitySlots,
    monthlyRent,
    rentBasis,
    securityDeposit,
    advancePaymentMonths: normalizedAdvanceMonths,
    furnishingStatus,
    genderPreference,
    amenities,
    availabilityStatus: isEnabled ? availabilityStatus : 'unavailable',
    isEnabled: Number(isEnabled),
    availableFrom: availableFrom || null
  };
}

async function getVisibleProperty(id, user) {
  const property = await properties.findById(id);
  const mayView = (property?.status === 'approved' && property?.owner_status === 'active')
    || Number(property?.owner_id) === Number(user?.id)
    || user?.role === 'admin';
  return mayView ? property : null;
}

function mayManage(property, user) {
  return Number(property?.owner_id) === Number(user?.id) || user?.role === 'admin';
}

export async function list(request, response, next) {
  try {
    const property = await getVisibleProperty(request.params.id, request.user);
    if (!property) return response.status(404).json({ message: 'Property not found.' });
    response.json({ data: await rentalSpaces.listByProperty(property.id) });
  } catch (error) { next(error); }
}

export async function create(request, response, next) {
  try {
    const property = await properties.findById(request.params.id);
    if (!property) return response.status(404).json({ message: 'Property not found.' });
    if (!mayManage(property, request.user)) return response.status(403).json({ message: 'Permission denied.' });
    if (property.status === 'archived') return response.status(409).json({ message: 'Archived properties cannot have new rental spaces.' });
    const input = normalizeRentalSpaceInput(request.body);
    const space = await rentalSpaces.create(property.id, input);
    if (request.user.role === 'owner') await properties.updateStatus(property.id, 'pending');
    response.status(201).json({ data: space });
  } catch (error) { next(error); }
}

export async function update(request, response, next) {
  try {
    const property = await properties.findById(request.params.id);
    if (!property) return response.status(404).json({ message: 'Property not found.' });
    if (!mayManage(property, request.user)) return response.status(403).json({ message: 'Permission denied.' });
    const existing = await rentalSpaces.findById(request.params.spaceId);
    if (!existing || Number(existing.property_id) !== Number(property.id)) return response.status(404).json({ message: 'Rental space not found.' });
    const input = normalizeRentalSpaceInput(request.body, existing);
    const space = await rentalSpaces.update(existing.id, input);
    if (request.user.role === 'owner') await properties.updateStatus(property.id, 'pending');
    response.json({ data: space });
  } catch (error) { next(error); }
}

export async function remove(request, response, next) {
  try {
    const property = await properties.findById(request.params.id);
    if (!property) return response.status(404).json({ message: 'Property not found.' });
    if (!mayManage(property, request.user)) return response.status(403).json({ message: 'Permission denied.' });
    const existing = await rentalSpaces.findById(request.params.spaceId);
    if (!existing || Number(existing.property_id) !== Number(property.id)) return response.status(404).json({ message: 'Rental space not found.' });
    if (existing.is_default) return response.status(409).json({ message: 'The primary rental space cannot be deleted. Edit it or disable it instead.' });
    if (!await rentalSpaces.remove(existing.id)) return response.status(409).json({ message: 'Rental space could not be deleted.' });
    if (request.user.role === 'owner') await properties.updateStatus(property.id, 'pending');
    response.status(204).end();
  } catch (error) { next(error); }
}

export async function listCategories(request, response, next) {
  try { response.json({ data: await categories.list() }); } catch (error) { next(error); }
}

export async function createCategory(request, response, next) {
  try {
    const slug = String(request.body.slug ?? '').trim().toLowerCase();
    const name = String(request.body.name ?? '').trim();
    if (!/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(slug) || !name || name.length > 120) {
      return response.status(422).json({ message: 'Provide a category name and a slug using lowercase letters, numbers, and underscores.' });
    }
    response.status(201).json({ data: await categories.create(slug, name) });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return response.status(409).json({ message: 'That property category already exists.' });
    next(error);
  }
}
