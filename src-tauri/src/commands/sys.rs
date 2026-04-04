use users::{get_current_uid, get_user_by_uid};
use serde::Serialize;

#[derive(Serialize)]
pub struct SystemUser {
    uid: u32,
    name: String,
    primary_group: u32,
}

#[tauri::command]
pub async fn sys_user() -> Result<SystemUser, String> {
    let user = get_user_by_uid(get_current_uid()).ok_or("Failed to get current system user")?;
    Ok(SystemUser {
        uid: user.uid(),
        name: user.name().to_string_lossy().into_owned(),
        primary_group: user.primary_group_id(),
    })
}