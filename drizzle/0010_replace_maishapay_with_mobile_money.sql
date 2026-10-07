-- MaishaPay is retired. Existing automatic records are kept for audit but can no longer execute.
UPDATE `agronex_payment_requests` SET `paymentMethod` = 'manual', `status` = 'rejected', `failureNote` = 'Ancien flux de paiement retiré; aucune transaction n’a été relancée.' WHERE `paymentMethod` = 'maishapay';
UPDATE `agronex_payout_requests` SET `method` = 'manual', `status` = 'rejected', `note` = 'Ancien flux de paiement retiré; aucun transfert n’a été relancé.' WHERE `method` = 'maishapay';
ALTER TABLE `agronex_profiles` MODIFY COLUMN `payoutProvider` enum('orange','airtel','afrimoney','mpesa');
ALTER TABLE `agronex_payment_requests` MODIFY COLUMN `provider` enum('orange','airtel','afrimoney','mpesa') NOT NULL;
ALTER TABLE `agronex_payment_requests` MODIFY COLUMN `farmerPayoutProvider` enum('orange','airtel','afrimoney','mpesa');
ALTER TABLE `agronex_payment_requests` MODIFY COLUMN `paymentMethod` enum('manual') NOT NULL DEFAULT 'manual';
ALTER TABLE `agronex_payout_requests` MODIFY COLUMN `provider` enum('orange','airtel','afrimoney','mpesa') NOT NULL;
ALTER TABLE `agronex_payout_requests` MODIFY COLUMN `method` enum('manual') NOT NULL DEFAULT 'manual';
ALTER TABLE `agronex_payment_settings` ADD `orangeName` varchar(100);
ALTER TABLE `agronex_payment_settings` ADD `orangePhone` varchar(48);
ALTER TABLE `agronex_payment_settings` ADD `afrimoneyName` varchar(100);
ALTER TABLE `agronex_payment_settings` ADD `afrimoneyPhone` varchar(48);
