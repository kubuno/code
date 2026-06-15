use axum::{
    middleware,
    routing::{delete, get, patch, post},
    Router,
};
use tower_http::trace::TraceLayer;

use crate::{
    handlers::{
        extensions, files, git, health, projects,
        settings_handler::{get_settings, settings_page, update_settings},
    },
    middleware::require_auth,
    state::AppState,
};

pub fn build(state: AppState) -> Router {
    let authed = Router::new()
        // Projets
        .route("/projects",     get(projects::list).post(projects::create))
        .route("/projects/:id", get(projects::get).patch(projects::update).delete(projects::delete))

        // Arborescence de fichiers
        .route("/projects/:id/tree", get(files::tree))

        // Fichiers (chemins arbitraires après /files/:id/)
        .route("/projects/:project_id/files/*tail", {
            get(files::read_file)
                .put(files::write_file)
                .delete(files::delete_path)
        })
        .route("/projects/:project_id/rename/*tail",   patch(files::rename_path))
        .route("/projects/:project_id/mkdir/*tail",    post(files::create_dir))

        // Git
        .route("/projects/:project_id/git",             get(git::status))
        .route("/projects/:project_id/git/init",        post(git::init))
        .route("/projects/:project_id/git/commit",      post(git::commit))
        .route("/projects/:project_id/git/diff/*tail",  get(git::diff))

        // NB : pas de terminal ni de LSP. Ces fonctionnalités lançaient des
        // processus (shell, serveurs de langage) sur la machine hôte ; elles ont
        // été retirées pour qu'aucun utilisateur ne puisse exécuter de commande
        // sur le serveur. Un filtre seccomp (voir main.rs) bloque en plus toute
        // tentative d'exécution de processus par ce module.

        // Extensions
        .route("/extensions",         get(extensions::list).post(extensions::install))
        .route("/extensions/market",  get(extensions::search_market))
        .route("/extensions/:id",     delete(extensions::uninstall))
        .route("/extensions/:id/toggle", post(extensions::toggle))

        // Paramètres utilisateur
        .route("/settings",      get(get_settings).patch(update_settings))
        .route("/settings/page", get(settings_page))

        .layer(middleware::from_fn_with_state(state.clone(), require_auth))
        .with_state(state.clone());

    let system = Router::new()
        .route("/health", get(health::health))
        .with_state(state);

    // Pas de CorsLayer ici : le module n'est joignable que via le proxy du core
    // (server-to-server), qui porte déjà la politique CORS face au navigateur.
    Router::new()
        .merge(system)
        .nest("/", authed)
        .layer(TraceLayer::new_for_http())
}
