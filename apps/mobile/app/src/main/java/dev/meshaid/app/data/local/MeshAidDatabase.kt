package dev.meshaid.app.data.local

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import dev.meshaid.app.data.local.dao.MeshAidDao
import dev.meshaid.app.data.local.entity.MeshAidMessageEntity
import dev.meshaid.app.data.local.entity.SeenPacketEntity

/**
 * Single-source Room database for MeshAid's offline relay engine.
 *
 * ### Schema
 * | Table            | Purpose                                             |
 * |------------------|-----------------------------------------------------|
 * | `mesh_messages`  | Priority-ranked outbound relay queue (wire bytes)   |
 * | `seen_packets`   | Deduplication cache (messageId → firstSeenTimestamp)|
 *
 * ### Migration policy
 * [fallbackToDestructiveMigration] is enabled for the initial development phase.
 * Before production release, explicit [Migration] objects must be added and this
 * flag removed to preserve user data across schema changes.
 *
 * ### Thread safety
 * All DAO methods are suspend functions executed by Room on the [Dispatchers.IO]
 * thread pool.  Callers must **not** run DAO calls on the main thread.
 *
 * @see MeshAidDao
 */
@Database(
    entities = [MeshAidMessageEntity::class, SeenPacketEntity::class],
    version = 1,
    exportSchema = false  // TODO: enable exportSchema + schemaLocation before production migrations
)
abstract class MeshAidDatabase : RoomDatabase() {

    abstract fun meshAidDao(): MeshAidDao

    companion object {
        private const val DB_NAME = "meshaid.db"

        @Volatile
        private var INSTANCE: MeshAidDatabase? = null

        /**
         * Returns the singleton [MeshAidDatabase] instance, creating it if necessary.
         *
         * Thread-safe via double-checked locking on [INSTANCE].
         */
        fun getInstance(context: Context): MeshAidDatabase =
            INSTANCE ?: synchronized(this) {
                INSTANCE ?: buildDatabase(context).also { INSTANCE = it }
            }

        private fun buildDatabase(context: Context): MeshAidDatabase =
            Room.databaseBuilder(
                context.applicationContext,
                MeshAidDatabase::class.java,
                DB_NAME
            )
                .fallbackToDestructiveMigration() // TODO: replace with explicit migrations pre-release
                .build()
    }
}
