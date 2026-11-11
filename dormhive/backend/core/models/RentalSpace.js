import { query } from '../config/database.js';

export async function listByProperty(propertyId) {
  return query(
    `SELECT rs.*, COALESCE(occupancy.occupied_slots, 0) AS occupied_slots,
      GREATEST(0, rs.capacity_slots - COALESCE(occupancy.occupied_slots, 0)) AS available_slots
     FROM rental_spaces rs
     LEFT JOIN (
       SELECT rental_space_id, COUNT(*) AS occupied_slots
       FROM bookings
       WHERE status = 'approved'
       GROUP BY rental_space_id
     ) occupancy ON occupancy.rental_space_id = rs.id
     WHERE rs.property_id = ?
     ORDER BY rs.is_default DESC, rs.created_at ASC, rs.id ASC`,
    [propertyId]
  );
}

export async function findById(id) {
  const rows = await query('SELECT * FROM rental_spaces WHERE id = ? LIMIT 1', [id]);
  return rows[0] ?? null;
}

export async function create(propertyId, input) {
  const result = await query(
    `INSERT INTO rental_spaces
      (property_id, name, category, occupancy_type, space_type, description, rental_arrangement,
       max_occupants, capacity_slots, total_slots, monthly_rent, rent_basis, security_deposit, advance_payment_months,
       furnishing_status, gender_preference, amenities, availability_status, is_enabled, available_from)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      propertyId, input.name, input.spaceType, input.rentalArrangement, input.spaceType,
      input.description, input.rentalArrangement, input.maxOccupants, input.capacitySlots,
      input.capacitySlots, input.monthlyRent, input.rentBasis,
      input.securityDeposit, input.advancePaymentMonths, input.furnishingStatus,
      input.genderPreference, input.amenities, input.availabilityStatus, input.isEnabled,
      input.availableFrom
    ]
  );
  return findById(result.insertId);
}

export async function update(id, input) {
  await query(
    `UPDATE rental_spaces SET
      name = ?, space_type = ?, description = ?, rental_arrangement = ?, max_occupants = ?,
      category = ?, occupancy_type = ?, capacity_slots = ?, total_slots = ?, monthly_rent = ?, rent_basis = ?, security_deposit = ?,
      advance_payment_months = ?, furnishing_status = ?, gender_preference = ?,
      amenities = ?, availability_status = ?, is_enabled = ?, available_from = ?
     WHERE id = ?`,
    [
      input.name, input.spaceType, input.description, input.rentalArrangement,
      input.maxOccupants, input.spaceType, input.rentalArrangement, input.capacitySlots,
      input.capacitySlots, input.monthlyRent, input.rentBasis,
      input.securityDeposit, input.advancePaymentMonths, input.furnishingStatus,
      input.genderPreference, input.amenities, input.availabilityStatus, input.isEnabled,
      input.availableFrom, id
    ]
  );
  return findById(id);
}

export async function remove(id) {
  const result = await query('DELETE FROM rental_spaces WHERE id = ? AND is_default = 0', [id]);
  return result.affectedRows > 0;
}
