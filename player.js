async function handlePlayerModalSubmit(client, modal, player, channel) {
    await modal.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

    try {
        if (modal.customId === 'player_modal_addsong') {
            const query = modal.fields.getTextInputValue('query')?.trim();

            if (!query) {
                await modal.editReply({ content: '❌ Please provide a valid song name or URL.' }).catch(() => {});
                return;
            }

            const resolve = await client.riffy.resolve({
                query,
                requester: modal.user.username
            });

            if (!resolve || !Array.isArray(resolve.tracks) || resolve.tracks.length === 0) {
                await modal.editReply({ content: '❌ No results found for that query.' }).catch(() => {});
                return;
            }

            let added = 0;

            if (resolve.loadType === 'playlist') {
                for (const track of resolve.tracks) {
                    if (!track?.info?.uri) continue;

                    track.info.requester = modal.user.username;
                    player.queue.add(track);
                    requesters.set(track.info.uri, modal.user.username);
                    added++;
                }
            } else {
                const track = resolve.tracks[0];

                if (track?.info?.uri) {
                    track.info.requester = modal.user.username;
                    player.queue.add(track);
                    requesters.set(track.info.uri, modal.user.username);
                    added = 1;
                }
            }

            if (added === 0) {
                await modal.editReply({ content: '❌ No playable tracks were found.' }).catch(() => {});
                return;
            }

            if (!player.playing && !player.paused && !player.current && player.queue.length > 0) {
                await player.play();
            }

            await modal.editReply({
                content: `✅ Added ${added} ${added === 1 ? 'song' : 'songs'} to the queue.`
            }).catch(() => {});
            return;
        }

        if (modal.customId === 'player_modal_volume') {
            const raw = modal.fields.getTextInputValue('volume')?.trim();
            const volume = Number.parseInt(raw, 10);

            if (!Number.isInteger(volume) || volume < 1 || volume > 100) {
                await modal.editReply({ content: '❌ Volume must be a number between 1 and 100.' }).catch(() => {});
                return;
            }

            await player.setVolume(volume);
            await refreshNowPlayingPanel(client, player.guildId);
            await modal.editReply({ content: `🔊 Volume set to ${volume}%.` }).catch(() => {});
            return;
        }

        if (modal.customId === 'player_modal_save_song') {
            const current = player.current?.info;

            if (!current?.uri) {
                await modal.editReply({ content: '❌ No active song to save.' }).catch(() => {});
                return;
            }

            const rawPlaylistName = modal.fields.getTextInputValue('playlistName')?.trim();
            const playlistName = rawPlaylistName?.slice(0, 80);

            if (!playlistName) {
                await modal.editReply({ content: '❌ Playlist name is required.' }).catch(() => {});
                return;
            }

            const userId = modal.user.id;
            const serverId = channel.guild.id;
            const serverName = channel.guild.name;

            const existing = await playlistCollection.findOne({
                name: playlistName,
                userId,
                serverId
            });

            if (!existing) {
                await playlistCollection.insertOne({
                    name: playlistName,
                    songs: [],
                    isPrivate: false,
                    userId,
                    serverId,
                    serverName
                });
            }

            await playlistCollection.updateOne(
                { name: playlistName, userId, serverId },
                { $addToSet: { songs: { url: current.uri } } }
            );

            await modal.editReply({
                content: `💾 Saved current song to playlist: ${playlistName}`
            }).catch(() => {});
            return;
        }

        await modal.editReply({ content: '❌ Unknown modal action.' }).catch(() => {});
    } catch (error) {
        console.error('[SUNAINA MUSIC] Modal action failed:', error);

        await modal.editReply({
            content: '⚠️ Failed to process modal action. Please try again.'
        }).catch(() => {});
    }
}
