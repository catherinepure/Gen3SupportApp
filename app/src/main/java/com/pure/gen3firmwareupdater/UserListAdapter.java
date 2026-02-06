package com.pure.gen3firmwareupdater;

import android.graphics.Color;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.recyclerview.widget.RecyclerView;

import java.util.List;

/**
 * Adapter for displaying users in a RecyclerView.
 * Used by UserManagementActivity for search results.
 */
public class UserListAdapter extends RecyclerView.Adapter<UserListAdapter.ViewHolder> {

    public interface OnUserClickListener {
        void onUserClick(UserInfo user);
    }

    private final List<UserInfo> users;
    private OnUserClickListener listener;

    public UserListAdapter(List<UserInfo> users) {
        this.users = users;
    }

    public void setOnUserClickListener(OnUserClickListener listener) {
        this.listener = listener;
    }

    @NonNull
    @Override
    public ViewHolder onCreateViewHolder(@NonNull ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
                .inflate(R.layout.item_user, parent, false);
        return new ViewHolder(view);
    }

    @Override
    public void onBindViewHolder(@NonNull ViewHolder holder, int position) {
        UserInfo user = users.get(position);

        // Name
        holder.tvUserName.setText(user.getDisplayName());

        // Email
        holder.tvUserEmail.setText(user.email != null ? user.email : "");

        // User level
        holder.tvUserLevel.setText(user.getUserLevelDisplay());

        // Status with colour coding
        String status = user.getStatusDisplay();
        holder.tvUserStatus.setText(status);
        switch (status) {
            case "Active":
                holder.tvUserStatus.setTextColor(Color.parseColor("#4CAF50")); // green
                break;
            case "Inactive":
                holder.tvUserStatus.setTextColor(Color.parseColor("#F44336")); // red
                break;
            case "Unverified":
                holder.tvUserStatus.setTextColor(Color.parseColor("#FF9800")); // orange
                break;
            default:
                holder.tvUserStatus.setTextColor(Color.GRAY);
                break;
        }

        // Click listener
        holder.itemView.setOnClickListener(v -> {
            if (listener != null) {
                listener.onUserClick(user);
            }
        });
    }

    @Override
    public int getItemCount() {
        return users.size();
    }

    public static class ViewHolder extends RecyclerView.ViewHolder {
        TextView tvUserName;
        TextView tvUserEmail;
        TextView tvUserLevel;
        TextView tvUserStatus;

        public ViewHolder(@NonNull View itemView) {
            super(itemView);
            tvUserName = itemView.findViewById(R.id.tvUserName);
            tvUserEmail = itemView.findViewById(R.id.tvUserEmail);
            tvUserLevel = itemView.findViewById(R.id.tvUserLevel);
            tvUserStatus = itemView.findViewById(R.id.tvUserStatus);
        }
    }
}
