  assert.equal(inventoryDead.movementCoverage.status,"VERIFIED");
  assert.equal(inventoryDead.movementCoverage.completeness,"COMPLETE");
  assert.ok(Date.parse(inventoryDead.lastMovementAt)<Date.parse(inventoryAsOf.as_of));
  assert.equal(Number(inventoryDead.availableQuantity.value),5);
  assert.equal(inventoryDead.availableQuantity.period,null,
    "current available quantity is a point-in-time snapshot, not a fabricated historical period");
  const inventoryReplenishment=inventoryAggregate.replenishmentProducts[0];
  assert.equal(Number(inventoryReplenishment.availableToPromise.value),5);
  assert.equal(Number(inventoryReplenishment.reorderPoint.value),20);
  assert.equal(Number(inventoryReplenishment.soldQuantityWindow.value),30);
  assert.equal(Number(inventoryReplenishment.supplierLeadTimeDays.value),10);
  assert.equal(inventoryReplenishment.supplierLeadTimeDays.period,null);
  assert.equal(inventoryAggregate.evidenceRecords.some((e) => e.id==="purchase-receipt-item:"+inventoryReceiptItemId),true);
  assert.equal(inventoryAggregate.evidenceRecords.some((e) => e.id==="movement-window:"+inventoryForeignProductId),false);
  // Update fixture source timestamps using the privileged setup connection; then
  // restore the authenticated tenant role before the aggregate read below.
  await db.unsafe("reset role");
  const laterInventorySourceTimestamp=new Date(Date.parse(inventoryAsOf.as_of)+1000).toISOString();
  await db.unsafe(
    "update public.inventory_balances set updated_at=$3::timestamptz where product_id=$1 and warehouse_id=$2",
    [inventoryProductId,inventoryWarehouseId,laterInventorySourceTimestamp],
  );
  await db.unsafe(
    "update public.orders set updated_at=$2::timestamptz where id=$1",
    [inventorySaleOrderId,laterInventorySourceTimestamp],
  );
  await db.unsafe("set role authenticated");
  const historicalInventoryAggregate=(await db.unsafe(
    "select public.get_inventory_intelligence_aggregate($1::date,$2::date,$3::timestamptz) as result",
    [inventoryAsOf.from_day,inventoryAsOf.to_day,inventoryAsOf.as_of],
  ))[0].result;
  const historicalDead=historicalInventoryAggregate.deadStockProducts[0];
  const historicalReplenishment=historicalInventoryAggregate.replenishmentProducts[0];
  assert.equal(historicalDead.availableQuantity.status,"UNAVAILABLE",
    "a balance snapshot updated after asOf must be withheld, not backdated");
  assert.equal(historicalDead.availableQuantity.value,null);
  assert.equal(historicalReplenishment.availableToPromise.status,"UNAVAILABLE");
  assert.equal(Number(historicalReplenishment.soldQuantityWindow.value),0,
    "an order whose status changed after asOf must not count as historically fulfilled sales");
  const inventoryAuditAfter=(await db.unsafe(
    "select count(*)::integer as count from public.audit_logs where organization_id=$1",
    [intelOrganizationId],
  ))[0].count;
  assert.equal(inventoryAuditAfter,inventoryAuditBefore,"inventory intelligence reads must not append audit rows");
  const inventoryPrivileges=(await db.unsafe(
    "select has_function_privilege('anon','public.get_inventory_intelligence_aggregate(date,date,timestamptz)','EXECUTE') as anon_can_execute,has_function_privilege('authenticated','public.get_inventory_intelligence_aggregate(date,date,timestamptz)','EXECUTE') as authenticated_can_execute",
  ))[0];
  assert.equal(inventoryPrivileges.anon_can_execute,false);
  assert.equal(inventoryPrivileges.authenticated_can_execute,true);
  await db.unsafe("reset role");
  await setIdentity(operationsStaffAuthUserId,"ci-operations-staff@example.test");
  await db.unsafe("set role authenticated");
  await expectFailure(
    "ordinary staff cannot read manager-only inventory intelligence",
    () => db.unsafe(
      "select public.get_inventory_intelligence_aggregate($1::date,$2::date,$3::timestamptz)",
      [inventoryAsOf.from_day,inventoryAsOf.to_day,inventoryAsOf.as_of],
    ),
    /finance manager permission required for inventory intelligence/i,
    "42501",
  );
  await db.unsafe("reset role");
  await setIdentity(intelAuthUserId,"ci-intelligence-admin@example.test");
  await db.unsafe("set role authenticated");
  process.stdout.write("PASS REF-INVENTORY-INTELLIGENCE-001: complete tenant population, ATP/reorder/sales metrics, observed receipt lead time, resolved evidence lineage, point-in-time stock semantics, read-only side effects and role denial\n");


  const intelPrivileges = (await db.unsafe(
    "select has_function_privilege('anon','public.get_intelligence_aggregate(jsonb)','EXECUTE') as anon_can_execute, has_function_privilege('authenticated','public.get_intelligence_aggregate(jsonb)','EXECUTE') as authenticated_can_execute",