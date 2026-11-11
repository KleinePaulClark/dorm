import { query } from '../config/database.js';
import pool from '../config/database.js';
import * as mediaFiles from './Media.js';

const categoryByRoomType = {
  bedspace: 'bedspace',
  bed_space: 'bedspace',
  private_room: 'room_for_rent',
  'private room': 'room_for_rent',
  solo_room: 'room_for_rent',
  'solo room': 'room_for_rent',
  entire_unit: 'studio_unit',
  'entire unit': 'studio_unit',
  studio_unit: 'studio_unit',
  'studio unit': 'studio_unit'
};

async function categoryIdFor(slug, roomType) {
  const resolvedSlug = String(slug ?? '').trim().toLowerCase()
    || categoryByRoomType[String(roomType ?? '').trim().toLowerCase()]
    || 'other';
  const rows = await query('SELECT id FROM property_categories WHERE slug = ? LIMIT 1', [resolvedSlug]);
  if (!rows[0]) {
    const error = new Error(`Unknown property category: ${resolvedSlug}.`);
    error.statusCode = 422;
    error.expose = true;
    throw error;
  }
  return rows[0].id;
}

async function createDefaultSpace(connection, propertyId, input) {
  const arrangement = input.rentalArrangement
    ? input.rentalArrangement
    : String(input.roomType).toLowerCase() === 'bedspace' ? 'shared' : 'exclusive';
  const capacitySlots = arrangement === 'shared' ? Math.max(1, Number(input.totalSlots ?? 1)) : 1;
  await connection.execute(
    `INSERT INTO rental_spaces
      (property_id, name, category, occupancy_type, space_type, description, rental_arrangement,
       max_occupants, capacity_slots, total_slots, monthly_rent, rent_basis, security_deposit,
       advance_payment_months, furnishing_status, gender_preference, amenities, availability_status, is_default)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'unavailable', 1)`,
    [
      propertyId, input.spaceName ?? input.title, input.roomType, arrangement,
      input.roomType, input.spaceDescription ?? input.description ?? null,
      arrangement, Math.max(1, Number(input.maxOccupants ?? input.totalSlots ?? 1)), capacitySlots,
      capacitySlots,
      input.monthlyRent, input.rentBasis ?? (arrangement === 'shared' ? 'per_slot' : 'per_space'),
      input.securityDeposit || null, input.advancePaymentMonths === '' ? null : input.advancePaymentMonths ?? null,
      input.furnishingStatus ?? 'unspecified', input.genderPreference || null, input.amenities ?? null
    ]
  );
}

export async function list({ page, limit, municipality, roomType, minPrice, maxPrice, status, viewer }) {
  const filters = [];
  const values = [];
  const availableRentalSlots = 'GREATEST(0, COALESCE(p.total_slots, 1) - (SELECT COUNT(*) FROM bookings slot_booking WHERE slot_booking.property_id = p.id AND slot_booking.status = \'approved\'))';
  if (viewer?.role === 'admin') {
    // Administrators may view and moderate every property.
  } else if (viewer?.role === 'owner') {
    filters.push("((p.status = 'approved' AND u.status = 'active') OR p.owner_id = ?)");
    values.push(viewer.id);
  } else {
    filters.push("p.status = 'approved'");
    filters.push("u.status = 'active'");
    filters.push(`${availableRentalSlots} > 0`);
  }
  if (municipality) { filters.push('p.municipality = ?'); values.push(municipality); }
  if (roomType) { filters.push('p.room_type = ?'); values.push(roomType); }
  if (minPrice) { filters.push('p.monthly_rent >= ?'); values.push(minPrice); }
  if (maxPrice) { filters.push('p.monthly_rent <= ?'); values.push(maxPrice); }
  if (status) { filters.push('p.status = ?'); values.push(status); }
  const where = filters.join(' AND ') || '1 = 1';
  const offset = (page - 1) * limit;
  const rows = await query(`SELECT p.*, pc.slug AS property_category, pc.name AS property_category_name, primary_space.name AS space_name, primary_space.rental_arrangement, primary_space.rent_basis, primary_space.security_deposit, primary_space.advance_payment_months, primary_space.furnishing_status, primary_space.max_occupants AS space_max_occupants, primary_space.capacity_slots AS space_capacity_slots, primary_space.availability_status AS space_availability_status, ${availableRentalSlots} AS rentable_slots_available, COALESCE((SELECT SUM(COALESCE(b.occupants, 1)) FROM bookings b WHERE b.property_id = p.id AND b.status = 'approved'), 0) AS occupied_units, EXISTS(SELECT 1 FROM media_files proof WHERE proof.id = p.ownership_document_id AND proof.uploaded_by = p.owner_id AND proof.is_private = 1) AS has_ownership_proof, COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), NULLIF(TRIM(u.name), '')) AS owner_name, u.email AS owner_email, u.avatar_url AS owner_avatar_url, u.status AS owner_status FROM properties p JOIN users u ON u.id = p.owner_id LEFT JOIN property_categories pc ON pc.id = p.property_category_id LEFT JOIN rental_spaces primary_space ON primary_space.property_id = p.id AND primary_space.is_default = 1 WHERE ${where} ORDER BY p.created_at DESC LIMIT ? OFFSET ?`, [...values, limit, offset]);
  const total = await query(`SELECT COUNT(*) AS count FROM properties p JOIN users u ON u.id = p.owner_id WHERE ${where}`, values);
  return {
    rows: rows.map(({ rentable_slots_available, ...property }) => ({
      ...property,
      available_slots: Number(rentable_slots_available ?? 0)
    })),
    total: total[0].count
  };
}

export async function findById(id) {
  const rows = await query(`SELECT p.*, pc.slug AS property_category, pc.name AS property_category_name, primary_space.name AS space_name, primary_space.rental_arrangement, primary_space.rent_basis, primary_space.security_deposit, primary_space.advance_payment_months, primary_space.furnishing_status, primary_space.max_occupants AS space_max_occupants, primary_space.capacity_slots AS space_capacity_slots, primary_space.availability_status AS space_availability_status, GREATEST(0, COALESCE(p.total_slots, 1) - (SELECT COUNT(*) FROM bookings slot_booking WHERE slot_booking.property_id = p.id AND slot_booking.status = 'approved')) AS rentable_slots_available, COALESCE((SELECT SUM(COALESCE(b.occupants, 1)) FROM bookings b WHERE b.property_id = p.id AND b.status = 'approved'), 0) AS occupied_units, EXISTS(SELECT 1 FROM media_files proof WHERE proof.id = p.ownership_document_id AND proof.uploaded_by = p.owner_id AND proof.is_private = 1) AS has_ownership_proof, COALESCE(NULLIF(TRIM(CONCAT_WS(' ', u.first_name, u.last_name)), ''), NULLIF(TRIM(u.name), '')) AS owner_name, u.email AS owner_email, u.avatar_url AS owner_avatar_url, u.status AS owner_status FROM properties p JOIN users u ON u.id = p.owner_id LEFT JOIN property_categories pc ON pc.id = p.property_category_id LEFT JOIN rental_spaces primary_space ON primary_space.property_id = p.id AND primary_space.is_default = 1 WHERE p.id = ? LIMIT 1`, [id]);
  const property = rows[0];
  if (!property) return null;
  const { rentable_slots_available, ...details } = property;
  return { ...details, available_slots: Number(rentable_slots_available ?? 0) };
}

export async function countPendingByOwner(ownerId) {
  const rows = await query("SELECT COUNT(*) AS count FROM properties WHERE owner_id = ? AND status = 'pending'", [ownerId]);
  return Number(rows[0]?.count ?? 0);
}

export async function findDuplicateAddress({ ownerId, address, municipality, barangay, excludeId = null }) {
  const excludeClause = excludeId ? ' AND id <> ?' : '';
  const values = [ownerId, address, municipality, barangay ?? ''];
  if (excludeId) values.push(excludeId);
  const rows = await query(
    `SELECT id, title FROM properties
     WHERE owner_id = ? AND status IN ('pending', 'approved')
       AND LOWER(TRIM(address)) = LOWER(TRIM(?))
       AND LOWER(TRIM(municipality)) = LOWER(TRIM(?))
       AND LOWER(TRIM(COALESCE(barangay, ''))) = LOWER(TRIM(?))${excludeClause}
     LIMIT 1`,
    values
  );
  return rows[0] ?? null;
}

export async function findOwnershipDocument(id) {
  const rows = await query(
    `SELECT m.id, m.original_filename, m.mime_type
     FROM properties p
     JOIN media_files m ON m.id = p.ownership_document_id AND m.uploaded_by = p.owner_id AND m.is_private = 1
     WHERE p.id = ? LIMIT 1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function create(ownerId, input) {
  const arrangement = input.rentalArrangement
    ? input.rentalArrangement
    : String(input.roomType).toLowerCase() === 'bedspace' ? 'shared' : 'exclusive';
  const totalSlots = arrangement === 'shared' ? Math.max(1, Number(input.totalSlots ?? 1)) : 1;
  const propertyCategoryId = await categoryIdFor(input.propertyCategory, input.roomType);
  const connection = await pool.getConnection();
  let propertyId;
  try {
    await connection.beginTransaction();
    const [result] = await connection.execute(
      `INSERT INTO properties
        (owner_id, title, description, address, municipality, barangay, latitude, longitude,
         room_type, monthly_rent, max_occupants, total_slots, available_slots, gender_preference,
         amenities, image_url, images, ownership_document_id, property_category_id, house_rules, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`,
      [
        ownerId, input.title, input.description ?? null, input.address, input.municipality,
        input.barangay ?? null, input.latitude ?? null, input.longitude ?? null, input.roomType,
        input.monthlyRent, input.maxOccupants ?? null, totalSlots, totalSlots,
        input.genderPreference || null, input.amenities ?? null, input.imageUrl ?? null,
        JSON.stringify(input.images ?? []), input.ownershipDocumentId ?? null, propertyCategoryId,
        input.houseRules ?? null
      ]
    );
    propertyId = result.insertId;
    await createDefaultSpace(connection, propertyId, { ...input, totalSlots });
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
  return findById(propertyId);
}

export async function update(id, input) {
  const propertyCategoryId = input.propertyCategory
    ? await categoryIdFor(input.propertyCategory, input.roomType)
    : null;
  await query(`UPDATE properties SET
    title = COALESCE(?, title),
    description = COALESCE(?, description),
    address = COALESCE(?, address),
    municipality = COALESCE(?, municipality),
    barangay = COALESCE(?, barangay),
    latitude = COALESCE(?, latitude),
    longitude = COALESCE(?, longitude),
    room_type = COALESCE(?, room_type),
    monthly_rent = COALESCE(?, monthly_rent),
    max_occupants = COALESCE(?, max_occupants),
    total_slots = COALESCE(?, total_slots),
    gender_preference = IF(?, ?, gender_preference),
    amenities = COALESCE(?, amenities),
    image_url = COALESCE(?, image_url),
    images = COALESCE(?, images),
    ownership_document_id = COALESCE(?, ownership_document_id),
    property_category_id = COALESCE(?, property_category_id),
    house_rules = COALESCE(?, house_rules),
    status = COALESCE(?, status)
  WHERE id = ?`, [
    input.title ?? null, input.description ?? null, input.address ?? null, input.municipality ?? null,
    input.barangay ?? null, input.latitude ?? null, input.longitude ?? null, input.roomType ?? null,
    input.monthlyRent ?? null, input.maxOccupants ?? null, input.totalSlots ?? null,
    input.genderPreference !== undefined, input.genderPreference ?? null, input.amenities ?? null,
    input.imageUrl ?? null, input.images ? JSON.stringify(input.images) : null,
    input.ownershipDocumentId ?? null, propertyCategoryId, input.houseRules ?? null, input.status ?? null, id
  ]);
  await query(`UPDATE rental_spaces SET
    name = COALESCE(?, name),
    space_type = COALESCE(?, space_type),
    description = COALESCE(?, description),
    rental_arrangement = COALESCE(?, rental_arrangement),
    max_occupants = COALESCE(?, max_occupants),
    capacity_slots = COALESCE(?, capacity_slots),
    monthly_rent = COALESCE(?, monthly_rent),
    rent_basis = COALESCE(?, rent_basis),
    security_deposit = IF(?, ?, security_deposit),
    advance_payment_months = IF(?, ?, advance_payment_months),
    furnishing_status = COALESCE(?, furnishing_status),
    gender_preference = COALESCE(?, gender_preference),
    amenities = COALESCE(?, amenities)
  WHERE property_id = ? AND is_default = 1`, [
    input.spaceName ?? input.title ?? null, input.spaceType ?? input.roomType ?? null,
    input.spaceDescription ?? input.description ?? null, input.rentalArrangement ?? null,
    input.maxOccupants ?? null,
    input.rentalArrangement
      ? input.rentalArrangement === 'exclusive' ? 1 : input.totalSlots ?? null
      : null,
    input.monthlyRent ?? null, input.rentBasis ?? null,
    input.securityDeposit !== undefined, input.securityDeposit ?? null,
    input.advancePaymentMonths !== undefined, input.advancePaymentMonths ?? null,
    input.furnishingStatus ?? null,
    input.genderPreference !== undefined || input.gender_preference !== undefined,
    input.genderPreference ?? input.gender_preference ?? null, input.amenities ?? null, id
  ]);
  if (input.status) {
    await query(
      `UPDATE rental_spaces SET availability_status = CASE
        WHEN ? = 'approved' AND is_enabled = 1 THEN 'available'
        ELSE 'unavailable'
      END WHERE property_id = ?`,
      [input.status, id]
    );
  }
  return syncAvailability(id);
}

export async function appendImage(id, imageUrl) {
  const property = await findById(id);
  let images = [];
  try {
    images = Array.isArray(property?.images) ? property.images : JSON.parse(property?.images || '[]');
  } catch {}
  images.push(imageUrl);
  await query('UPDATE properties SET image_url = COALESCE(image_url, ?), images = ? WHERE id = ?', [imageUrl, JSON.stringify(images), id]);
  return findById(id);
}

export async function replaceImages(id, imageUrl, images) {
  await query('UPDATE properties SET image_url = ?, images = ? WHERE id = ?', [imageUrl, JSON.stringify(images), id]);
}

export async function syncAvailability(id) {
  const property = await findById(id);
  if (!property) return null;
  const totalSlots = Math.max(0, Number(property.total_slots ?? 1));
  const [row] = await query('SELECT COUNT(*) AS occupied_slots FROM bookings WHERE property_id = ? AND status = ?', [id, 'approved']);
  const occupiedSlots = Math.max(0, Number(row?.occupied_slots ?? 0));
  const availableSlots = Math.max(0, totalSlots - occupiedSlots);
  await query('UPDATE properties SET available_slots = ? WHERE id = ?', [availableSlots, id]);
  return { ...property, available_slots: availableSlots, occupied_slots: occupiedSlots };
}

export async function updateStatus(id, status) {
  await query('UPDATE properties SET status = ? WHERE id = ?', [status, id]);
  await query(
    `UPDATE rental_spaces SET availability_status = CASE
      WHEN ? = 'approved' AND is_enabled = 1 THEN 'available'
      ELSE 'unavailable'
    END WHERE property_id = ?`,
    [status, id]
  );
  return findById(id);
}

export async function archive(id) {
  const result = await query(
    "UPDATE properties SET archived_status = status, status = 'archived', archived_at = NOW() WHERE id = ? AND status != 'archived'",
    [id]
  );
  return result.affectedRows ? findById(id) : null;
}

export async function restore(id) {
  const result = await query(
    "UPDATE properties SET status = COALESCE(archived_status, 'pending'), archived_status = NULL, archived_at = NULL WHERE id = ? AND status = 'archived'",
    [id]
  );
  return result.affectedRows ? findById(id) : null;
}

export async function remove(id) {
  await query('DELETE FROM bookings WHERE property_id = ?', [id]);
  return query('DELETE FROM properties WHERE id = ?', [id]);
}

export async function attachUploadedImages(id, images, uploaderId) {
  const ids = images.map((image) => Number(String(image).match(/^\/api\/v1\/media\/(\d+)$/)?.[1])).filter(Number.isInteger);
  if (ids.length) await mediaFiles.attachStagedToProperty(ids, id, uploaderId);
}
