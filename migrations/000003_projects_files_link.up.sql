-- Lien optionnel vers le dossier correspondant dans le module files
ALTER TABLE code.projects
    ADD COLUMN files_folder_id UUID;
