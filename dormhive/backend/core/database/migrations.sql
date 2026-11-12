-- DormHive Database Migrations
-- Run these SQL commands to set up your database schema

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  username VARCHAR(30) NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  avatar_url VARCHAR(255),
  role ENUM('tenant', 'owner', 'admin') DEFAULT 'tenant',
  status ENUM('active','suspended','pending','archived') DEFAULT 'active',
  verification_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved',
  verification_document_id INT NULL,
  archived_status ENUM('active','suspended','pending') NULL,
  archived_at DATETIME NULL,
  last_login_at DATETIME NULL,
  last_active_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_users_username (username)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_password_reset_user (user_id),
  INDEX idx_password_reset_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create properties table
CREATE TABLE IF NOT EXISTS properties (
  id INT AUTO_INCREMENT PRIMARY KEY,
  owner_id INT NOT NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT,
  address VARCHAR(255) NOT NULL,
  municipality VARCHAR(100) NOT NULL,
  barangay VARCHAR(100),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  room_type VARCHAR(100) NOT NULL,
  monthly_rent DECIMAL(10, 2) NOT NULL,
  max_occupants INT NULL,
  total_slots INT NOT NULL DEFAULT 1,
  available_slots INT,
  gender_preference ENUM('co-ed', 'male', 'female'),
  amenities JSON,
  image_url VARCHAR(255),
  images JSON,
  rental_areas JSON,
  ownership_document_id INT NULL,
  status ENUM('pending', 'approved', 'rejected', 'archived') DEFAULT 'pending',
  archived_status ENUM('pending', 'approved', 'rejected') NULL,
  archived_at DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_owner (owner_id),
  INDEX idx_municipality (municipality),
  INDEX idx_room_type (room_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create bookings table
CREATE TABLE IF NOT EXISTS bookings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  property_id INT NOT NULL,
  tenant_id INT NOT NULL,
  owner_id INT NOT NULL,
  move_in_date DATE,
  move_out_date DATE,
  is_indefinite_move_out TINYINT(1) NOT NULL DEFAULT 0,
  viewing_date DATE NULL,
  viewing_time TIME NULL,
  viewing_schedule_tenant_submitted TINYINT(1) NOT NULL DEFAULT 0,
  occupants INT NOT NULL DEFAULT 1,
  message TEXT,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_property (property_id),
  INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id INT AUTO_INCREMENT PRIMARY KEY,
  tenant_id INT NOT NULL,
  owner_id INT NOT NULL,
  property_id INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (tenant_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  INDEX idx_tenant (tenant_id),
  INDEX idx_owner (owner_id),
  INDEX idx_property (property_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  conversation_id INT NOT NULL,
  sender_id INT NOT NULL,
  body TEXT NOT NULL,
  photo_batch_id CHAR(36) NULL,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_conversation (conversation_id),
  INDEX idx_sender (sender_id),
  INDEX idx_read (read_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  read_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_read (read_at),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Create support_tickets table
CREATE TABLE IF NOT EXISTS support_tickets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  assigned_admin_id INT NULL,
  subject VARCHAR(255) NOT NULL,
  description TEXT,
  status ENUM('open', 'in-progress', 'resolved', 'closed') DEFAULT 'open',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_status (status),
  INDEX idx_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS assigned_admin_id INT NULL AFTER user_id;

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id INT AUTO_INCREMENT PRIMARY KEY,
  ticket_id INT NOT NULL,
  sender_id INT NOT NULL,
  body TEXT NOT NULL,
  is_internal TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ticket_messages_ticket (ticket_id),
  INDEX idx_ticket_messages_sender (sender_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Add missing columns to properties table if they don't exist
-- Run these if you have an existing properties table without these columns:
ALTER TABLE properties ADD COLUMN IF NOT EXISTS available_slots INT AFTER max_occupants;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS total_slots INT NULL AFTER max_occupants;
UPDATE properties SET total_slots = GREATEST(1, COALESCE(max_occupants, 1)) WHERE total_slots IS NULL;
ALTER TABLE properties MODIFY COLUMN total_slots INT NOT NULL DEFAULT 1;
ALTER TABLE properties MODIFY COLUMN max_occupants INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS gender_preference ENUM('co-ed', 'male', 'female') AFTER available_slots;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS amenities JSON AFTER gender_preference;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS images JSON AFTER image_url;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS rental_areas JSON AFTER images;
ALTER TABLE properties MODIFY COLUMN room_type VARCHAR(100) NOT NULL;

-- Add first_name and last_name to users for separate name storage
ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100) AFTER name;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100) AFTER first_name;
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(30) NULL AFTER name;
SET @username_index_exists = (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'users' AND index_name = 'idx_users_username'
);
SET @username_index_sql = IF(
  @username_index_exists = 0,
  'CREATE UNIQUE INDEX idx_users_username ON users (username)',
  'SELECT 1'
);
PREPARE username_index_stmt FROM @username_index_sql;
EXECUTE username_index_stmt;
DEALLOCATE PREPARE username_index_stmt;
ALTER TABLE users MODIFY COLUMN status ENUM('active','suspended','pending','archived') DEFAULT 'active';
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'approved';
ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_document_id INT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_status ENUM('active','suspended','pending') NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at DATETIME NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at DATETIME NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS ownership_document_id INT NULL;
UPDATE users SET last_active_at = last_login_at WHERE last_login_at IS NOT NULL AND last_active_at IS NULL;
ALTER TABLE properties MODIFY COLUMN status ENUM('pending', 'approved', 'rejected', 'archived') DEFAULT 'pending';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS archived_status ENUM('pending', 'approved', 'rejected') NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS is_indefinite_move_out TINYINT(1) NOT NULL DEFAULT 0 AFTER move_out_date;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS occupants INT NOT NULL DEFAULT 1 AFTER viewing_schedule_tenant_submitted;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS viewing_schedule_tenant_submitted TINYINT(1) NOT NULL DEFAULT 0 AFTER viewing_time;

ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT AFTER title;

-- Persist all uploaded files in the database; properties.image_url/images remain URL references.
ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS attachment_url VARCHAR(500) NULL;
ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS attachment_name VARCHAR(255) NULL;

CREATE TABLE IF NOT EXISTS media_files (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uploaded_by INT NOT NULL,
  user_id INT NULL,
  property_id INT NULL,
  message_id INT NULL,
  ticket_message_id INT NULL,
  is_private TINYINT(1) NOT NULL DEFAULT 0,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(127) NOT NULL,
  file_size INT UNSIGNED NOT NULL,
  file_data LONGBLOB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  FOREIGN KEY (ticket_message_id) REFERENCES support_ticket_messages(id) ON DELETE CASCADE,
  INDEX idx_media_uploaded_by (uploaded_by),
  INDEX idx_media_user (user_id),
  INDEX idx_media_property (property_id),
  INDEX idx_media_message (message_id),
  INDEX idx_media_ticket_message (ticket_message_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE media_files ADD COLUMN IF NOT EXISTS is_private TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS property_categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(80) NOT NULL UNIQUE,
  name VARCHAR(120) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO property_categories (slug, name) VALUES
  ('bedspace', 'Bedspace'),
  ('dormitory', 'Dormitory'),
  ('boarding_house', 'Boarding House'),
  ('room_for_rent', 'Room for Rent'),
  ('shared_apartment', 'Shared Apartment'),
  ('studio_unit', 'Studio Unit'),
  ('condominium', 'Condominium'),
  ('apartment', 'Apartment'),
  ('townhouse', 'Townhouse'),
  ('house', 'House'),
  ('duplex', 'Duplex'),
  ('loft', 'Loft'),
  ('penthouse', 'Penthouse'),
  ('staff_house', 'Staff House'),
  ('other', 'Other')
ON DUPLICATE KEY UPDATE name = VALUES(name);

ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_category_id INT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS house_rules TEXT NULL;

CREATE TABLE IF NOT EXISTS rental_spaces (
  id INT AUTO_INCREMENT PRIMARY KEY,
  property_id INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  category VARCHAR(100) NULL,
  occupancy_type ENUM('exclusive', 'shared') NOT NULL DEFAULT 'exclusive',
  space_type VARCHAR(100) NOT NULL,
  description TEXT NULL,
  rental_arrangement ENUM('exclusive', 'shared') NOT NULL DEFAULT 'exclusive',
  max_occupants INT NOT NULL DEFAULT 1,
  capacity_slots INT NOT NULL DEFAULT 1,
  total_slots INT NOT NULL DEFAULT 1,
  monthly_rent DECIMAL(10, 2) NOT NULL,
  rent_basis ENUM('per_space', 'per_slot') NOT NULL DEFAULT 'per_space',
  security_deposit DECIMAL(10, 2) NULL,
  advance_payment_months TINYINT UNSIGNED NULL,
  furnishing_status ENUM('furnished', 'partially_furnished', 'unfurnished', 'unspecified') NOT NULL DEFAULT 'unspecified',
  gender_preference ENUM('co-ed', 'male', 'female') NULL,
  amenities JSON NULL,
  availability_status ENUM('available', 'partially_occupied', 'fully_occupied', 'reserved', 'unavailable', 'coming_soon') NOT NULL DEFAULT 'available',
  is_enabled TINYINT(1) NOT NULL DEFAULT 1,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  available_from DATE NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (property_id) REFERENCES properties(id) ON DELETE CASCADE,
  INDEX idx_rental_spaces_property (property_id),
  INDEX idx_rental_spaces_availability (availability_status),
  INDEX idx_rental_spaces_arrangement (rental_arrangement)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS category VARCHAR(100) NULL AFTER name;
ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS occupancy_type ENUM('exclusive', 'shared') NOT NULL DEFAULT 'exclusive';
ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS space_type VARCHAR(100) NULL AFTER name;
ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS description TEXT NULL AFTER space_type;
ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS rental_arrangement ENUM('exclusive', 'shared') NOT NULL DEFAULT 'exclusive';
ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS capacity_slots INT NOT NULL DEFAULT 1;
ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS total_slots INT NOT NULL DEFAULT 1;
ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS rent_basis ENUM('per_space', 'per_slot') NOT NULL DEFAULT 'per_space';
ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS security_deposit DECIMAL(10, 2) NULL;
ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS advance_payment_months TINYINT UNSIGNED NULL;
ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS furnishing_status ENUM('furnished', 'partially_furnished', 'unfurnished', 'unspecified') NOT NULL DEFAULT 'unspecified';
ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS amenities JSON NULL;
ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS gender_preference ENUM('co-ed', 'male', 'female') NULL;
ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS is_enabled TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS is_default TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE rental_spaces ADD COLUMN IF NOT EXISTS available_from DATE NULL;
ALTER TABLE rental_spaces MODIFY COLUMN category VARCHAR(100) NULL;
ALTER TABLE rental_spaces MODIFY COLUMN availability_status ENUM('available', 'partially_occupied', 'fully_occupied', 'reserved', 'unavailable', 'coming_soon', 'occupied', 'maintenance') NOT NULL DEFAULT 'available';
UPDATE rental_spaces SET
  space_type = COALESCE(NULLIF(space_type, ''), NULLIF(category, ''), 'Rental space'),
  rental_arrangement = COALESCE(occupancy_type, rental_arrangement, 'exclusive'),
  capacity_slots = IF(
    COALESCE(occupancy_type, rental_arrangement) = 'exclusive',
    1,
    GREATEST(1, COALESCE(total_slots, capacity_slots, 1))
  ),
  rent_basis = IF(COALESCE(occupancy_type, rental_arrangement) = 'shared', 'per_slot', 'per_space'),
  availability_status = CASE availability_status
    WHEN 'occupied' THEN 'fully_occupied'
    WHEN 'maintenance' THEN 'unavailable'
    ELSE availability_status
  END;
UPDATE rental_spaces SET category = space_type, occupancy_type = rental_arrangement, total_slots = capacity_slots;
ALTER TABLE rental_spaces MODIFY COLUMN space_type VARCHAR(100) NOT NULL;
ALTER TABLE rental_spaces MODIFY COLUMN availability_status ENUM('available', 'partially_occupied', 'fully_occupied', 'reserved', 'unavailable', 'coming_soon') NOT NULL DEFAULT 'available';
UPDATE rental_spaces rs
JOIN (
  SELECT property_id, MIN(id) AS id
  FROM rental_spaces
  GROUP BY property_id
  HAVING SUM(is_default) = 0
) first_space ON first_space.id = rs.id
SET rs.is_default = 1;

CREATE TABLE IF NOT EXISTS rental_space_images (
  id INT AUTO_INCREMENT PRIMARY KEY,
  rental_space_id INT NOT NULL,
  image_url VARCHAR(500) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rental_space_id) REFERENCES rental_spaces(id) ON DELETE CASCADE,
  INDEX idx_rental_space_images_space (rental_space_id, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

UPDATE properties p
JOIN property_categories c ON c.slug = CASE
  WHEN LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) IN ('bedspace', 'bed_space') THEN 'bedspace'
  WHEN LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) IN ('private_room', 'solo_room', 'private') THEN 'room_for_rent'
  WHEN LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) IN ('entire_unit', 'studio_unit', 'studio') THEN 'studio_unit'
  WHEN LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) = 'dormitory' THEN 'dormitory'
  WHEN LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) = 'boarding_house' THEN 'boarding_house'
  WHEN LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) = 'shared_apartment' THEN 'shared_apartment'
  WHEN LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) = 'condominium' THEN 'condominium'
  WHEN LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) = 'apartment' THEN 'apartment'
  WHEN LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) = 'townhouse' THEN 'townhouse'
  WHEN LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) = 'house' THEN 'house'
  WHEN LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) = 'duplex' THEN 'duplex'
  WHEN LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) = 'loft' THEN 'loft'
  WHEN LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) = 'penthouse' THEN 'penthouse'
  WHEN LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) = 'staff_house' THEN 'staff_house'
  ELSE 'other'
END
SET p.property_category_id = c.id
WHERE p.property_category_id IS NULL;

INSERT INTO rental_spaces
  (property_id, name, category, occupancy_type, space_type, description, rental_arrangement, max_occupants, capacity_slots, total_slots, monthly_rent, rent_basis, gender_preference, amenities, availability_status, is_default)
SELECT p.id, p.title, p.room_type,
  IF(LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) IN ('bedspace', 'bed_space'), 'shared', 'exclusive'),
  p.room_type, p.description,
  IF(LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) IN ('bedspace', 'bed_space'), 'shared', 'exclusive'),
  GREATEST(1, COALESCE(p.max_occupants, 1)),
  IF(LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) IN ('bedspace', 'bed_space'), GREATEST(1, COALESCE(p.total_slots, 1)), 1),
  IF(LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) IN ('bedspace', 'bed_space'), GREATEST(1, COALESCE(p.total_slots, 1)), 1),
  p.monthly_rent,
  IF(LOWER(REPLACE(REPLACE(TRIM(p.room_type), ' ', '_'), '-', '_')) IN ('bedspace', 'bed_space'), 'per_slot', 'per_space'),
  p.gender_preference, p.amenities,
  IF(p.status = 'approved', 'available', 'unavailable'), 1
FROM properties p
LEFT JOIN rental_spaces rs ON rs.property_id = p.id AND rs.is_default = 1
WHERE rs.id IS NULL;

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rental_space_id INT NULL AFTER property_id;

UPDATE bookings b
JOIN rental_spaces rs ON rs.property_id = b.property_id AND rs.is_default = 1
SET b.rental_space_id = rs.id
WHERE b.rental_space_id IS NULL;

SET @property_category_fk_exists = (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'properties' AND CONSTRAINT_NAME = 'fk_properties_category'
);
SET @property_category_fk_sql = IF(
  @property_category_fk_exists = 0,
  'ALTER TABLE properties ADD CONSTRAINT fk_properties_category FOREIGN KEY (property_category_id) REFERENCES property_categories(id)',
  'SELECT 1'
);
PREPARE property_category_fk_stmt FROM @property_category_fk_sql;
EXECUTE property_category_fk_stmt;
DEALLOCATE PREPARE property_category_fk_stmt;

SET @booking_space_fk_exists = (
  SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'bookings' AND CONSTRAINT_NAME = 'fk_bookings_rental_space'
);
SET @booking_space_fk_sql = IF(
  @booking_space_fk_exists = 0,
  'ALTER TABLE bookings ADD CONSTRAINT fk_bookings_rental_space FOREIGN KEY (rental_space_id) REFERENCES rental_spaces(id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE booking_space_fk_stmt FROM @booking_space_fk_sql;
EXECUTE booking_space_fk_stmt;
DEALLOCATE PREPARE booking_space_fk_stmt;
