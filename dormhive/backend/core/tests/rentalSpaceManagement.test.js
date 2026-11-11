import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRentalSpaceInput } from '../controllers/rentalSpaceController.js';

const validSpace = {
  name: 'Room 101',
  spaceType: 'Private room',
  rentalArrangement: 'exclusive',
  maxOccupants: 2,
  capacitySlots: 4,
  monthlyRent: 12000
};

test('exclusive rental spaces are limited to one rentable reservation slot', () => {
  const result = normalizeRentalSpaceInput(validSpace);
  assert.equal(result.capacitySlots, 1);
  assert.equal(result.rentBasis, 'per_space');
});

test('shared rental spaces preserve slot capacity and use per-slot rent by default', () => {
  const result = normalizeRentalSpaceInput({ ...validSpace, rentalArrangement: 'shared' });
  assert.equal(result.capacitySlots, 4);
  assert.equal(result.rentBasis, 'per_slot');
});

test('exclusive spaces cannot be priced per slot', () => {
  assert.throws(
    () => normalizeRentalSpaceInput({ ...validSpace, rentBasis: 'per_slot' }),
    /Exclusive spaces must use a per-space rent/
  );
});

test('rental space validation rejects invalid capacities and arrangements', () => {
  assert.throws(
    () => normalizeRentalSpaceInput({ ...validSpace, maxOccupants: 0 }),
    /Maximum occupants must be a whole number greater than zero/
  );
  assert.throws(
    () => normalizeRentalSpaceInput({ ...validSpace, rentalArrangement: 'automatic' }),
    /Rental arrangement must be exclusive or shared/
  );
});

test('disabled rental spaces are saved as unavailable', () => {
  const result = normalizeRentalSpaceInput({ ...validSpace, isEnabled: false });
  assert.equal(result.isEnabled, 0);
  assert.equal(result.availabilityStatus, 'unavailable');
});

test('rental space amenities are stored as unique JSON values', () => {
  const result = normalizeRentalSpaceInput({
    ...validSpace,
    amenities: ['Wi-Fi', 'Parking', 'Wi-Fi']
  });
  assert.deepEqual(JSON.parse(result.amenities), ['Wi-Fi', 'Parking']);
});
