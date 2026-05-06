use serde::Serialize;
use whoami::{username};

#[derive(Serialize)]
pub struct SystemUser {
    // uid: u32,
    name: String,
    // primary_group: u32,
}

#[tauri::command]
pub async fn sys_user() -> Result<SystemUser, String> {
    // let user = get_user_by_uid(get_current_uid()).ok_or("Failed to get current system user")?;
    Ok(SystemUser {
        // uid: user.uid(),
        name: username().unwrap_or_else(|_| "<unknown>".to_string()),
        // primary_group: user.primary_group_id(),
    })
}
