CREATE TABLE stock (
  sku text PRIMARY KEY,
  available_units integer NOT NULL CHECK (available_units >= 0)
);

CREATE TABLE orders (
  id integer PRIMARY KEY,
  paid boolean NOT NULL
);

CREATE TABLE reservations (
  order_id integer REFERENCES orders,
  sku text REFERENCES stock,
  units integer NOT NULL CHECK (units > 0),
  PRIMARY KEY (order_id, sku)
);

INSERT INTO stock VALUES ('DEMO-SKU', 10);
INSERT INTO orders VALUES (1, true);
INSERT INTO reservations VALUES (1, 'DEMO-SKU', 2);
