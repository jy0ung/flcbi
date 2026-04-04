with source_rows as (
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
        disb_date
    from {{ source('raw', 'vehicle_import_rows') }}
)

select * from source_rows
