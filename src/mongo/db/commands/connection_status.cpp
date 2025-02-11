/**
 *    Copyright (C) 2018-present MongoDB, Inc.
 *
 *    This program is free software: you can redistribute it and/or modify
 *    it under the terms of the Server Side Public License, version 1,
 *    as published by MongoDB, Inc.
 *
 *    This program is distributed in the hope that it will be useful,
 *    but WITHOUT ANY WARRANTY; without even the implied warranty of
 *    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *    Server Side Public License for more details.
 *
 *    You should have received a copy of the Server Side Public License
 *    along with this program. If not, see
 *    <http://www.mongodb.com/licensing/server-side-public-license>.
 *
 *    As a special exception, the copyright holders give permission to link the
 *    code of portions of this program with the OpenSSL library under certain
 *    conditions as described in each individual source file and distribute
 *    linked combinations including the program with the OpenSSL library. You
 *    must comply with the Server Side Public License in all respects for
 *    all of the code used other than as permitted herein. If you modify file(s)
 *    with this exception, you may extend this exception to your version of the
 *    file(s), but you are not obligated to do so. If you do not wish to do so,
 *    delete this exception statement from your version. If you delete this
 *    exception statement from all source files in the program, then also delete
 *    it in the license file.
 */

#include "mongo/platform/basic.h"

#include "mongo/bson/util/bson_extract.h"
#include "mongo/db/auth/authorization_manager.h"
#include "mongo/db/auth/authorization_session.h"
#include "mongo/db/commands.h"
#include "mongo/db/commands/connection_status_gen.h"

namespace mongo {

class CmdConnectionStatus : public TypedCommand<CmdConnectionStatus> {
public:
    using Request = ConnectionStatusCommand;
    using Reply = typename ConnectionStatusCommand::Reply;

    class Invocation final : public InvocationBase {
    public:
        using InvocationBase::InvocationBase;

        Reply typedRun(OperationContext* opCtx) {
            auto* as = AuthorizationSession::get(opCtx->getClient());

            ConnectionStatusReplyAuthInfo info;
            info.setAuthenticatedUsers(iteratorToVector<UserName>(as->getAuthenticatedUserNames()));
            info.setAuthenticatedUserRoles(
                iteratorToVector<RoleName>(as->getAuthenticatedRoleNames()));
            if (request().getShowPrivileges()) {
                info.setAuthenticatedUserPrivileges(expandPrivileges(as));
            }

            Reply reply;
            reply.setAuthInfo(std::move(info));
            return reply;
        }

    private:
        template <typename T>
        static std::vector<T> iteratorToVector(AuthNameIterator<T> it) {
            std::vector<T> ret;
            for (; it.more(); it.next()) {
                ret.push_back(*it);
            }
            return ret;
        }

        static std::vector<Privilege> expandPrivileges(AuthorizationSession* as) {
            // Create a unified map of resources to privileges, to avoid duplicate
            // entries in the connection status output.
            User::ResourcePrivilegeMap unified;

            for (auto nameIt = as->getAuthenticatedUserNames(); nameIt.more(); nameIt.next()) {
                auto* authUser = as->lookupUser(*nameIt);
                for (const auto& privIter : authUser->getPrivileges()) {
                    auto it = unified.find(privIter.first);
                    if (it == unified.end()) {
                        unified[privIter.first] = privIter.second;
                    } else {
                        it->second.addActions(privIter.second.getActions());
                    }
                }
            }

            std::vector<Privilege> ret;
            std::transform(unified.cbegin(),
                           unified.cend(),
                           std::back_inserter(ret),
                           [](const auto& it) { return it.second; });
            return ret;
        }

        bool supportsWriteConcern() const final {
            return false;
        }

        void doCheckAuthorization(OperationContext* opCtx) const final {
            // No auth required
        }

        NamespaceString ns() const final {
            return NamespaceString(request().getDbName(), "");
        }
    };

    bool requiresAuth() const final {
        return false;
    }

    AllowedOnSecondary secondaryAllowed(ServiceContext*) const final {
        return AllowedOnSecondary::kAlways;
    }

} cmdConnectionStatus;

}  // namespace mongo
