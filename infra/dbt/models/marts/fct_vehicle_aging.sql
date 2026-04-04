with staged as (
    select * from {{ ref('stg_vehicle_imports') }}
)

select
    import_batch_id,
    chassis_no,
    branch_code,
    model,
    payment_method,
    salesman_name,
    customer_name,
    bg_date,
    shipment_etd_pkg,
    shipment_eta_kk_twu_sdk,
    date_received_by_outlet,
    delivery_date,
    disb_date,
    datediff(day, bg_date, delivery_date) as bg_to_delivery,
    datediff(day, bg_date, shipment_etd_pkg) as bg_to_shipment_etd,
    datediff(day, shipment_etd_pkg, shipment_eta_kk_twu_sdk) as etd_to_eta,
    datediff(day, shipment_eta_kk_twu_sdk, date_received_by_outlet) as eta_to_outlet_received,
    datediff(day, date_received_by_outlet, delivery_date) as outlet_received_to_delivery,
    datediff(day, bg_date, disb_date) as bg_to_disb,
    datediff(day, delivery_date, disb_date) as delivery_to_disb
from staged
